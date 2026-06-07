import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import {
  type SessionWorkspace,
  type WorkerSession,
  type WorkerSessionRecord,
} from '@/features/home/domain/session-workspace';

// ---------------------------------------------------------------------------
// /api/sessions — the new SQLite-backed source of truth.
//
// The server returns a flat list of currently-running sessions (a row
// exists in the database exactly when the session is alive). The dashboard
// expects the legacy SessionWorkspace shape, so we adapt one to the other
// here. Until activity capture lands, every session lands in the kanban's
// "working" column by default — the prompt/triage/done columns are real
// (the contract still includes them) but unreachable in v1.
// ---------------------------------------------------------------------------

export const homeWorkspaceQueryKey = ['home-workspace'] as const;

const apiSessionSchema = z.object({
  id: z.string(),
  projectPath: z.string(),
  projectName: z.string().optional().default(''),
  agentPlugin: z.string(),
  workspacePath: z.string(),
  zellijSession: z.string(),
  pid: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  title: z.string().optional().default(''),
  recap: z.string().optional().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});
type ApiSession = z.infer<typeof apiSessionSchema>;

const apiSessionsResponseSchema = z.array(apiSessionSchema);

export function homeWorkspaceQueryOptions() {
  return queryOptions({
    enabled: typeof window !== 'undefined',
    queryFn: fetchHomeWorkspace,
    queryKey: homeWorkspaceQueryKey,
    // SSE drives live updates — no polling.
    refetchInterval: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  });
}

async function fetchHomeWorkspace(): Promise<SessionWorkspace> {
  const response = await fetch('/api/sessions', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to load sessions: ${response.status}`);
  }
  const apiSessions = apiSessionsResponseSchema.parse(await response.json());
  return toSessionWorkspace(apiSessions);
}

// ---------------------------------------------------------------------------
// SSE subscription
//
// subscribeToSessionEvents opens an EventSource against /api/events and
// invalidates the workspace query whenever a session lifecycle or metadata
// event arrives. Returns a cleanup function.
//
// Why invalidate instead of patching the cache directly? The event payload
// only carries the session id; we still need to refetch /api/sessions to
// get the new row's full shape (project, agent, prompt, created_at). This
// is one round trip on each event — fine at the scale of one user spawning
// agents a few times a minute. If we ever need lower-latency updates,
// `session.created` events could carry the full DTO inline.
// ---------------------------------------------------------------------------

export function subscribeToSessionEvents(queryClient: QueryClient): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const source = new EventSource('/api/events');
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: homeWorkspaceQueryKey });
  };
  source.addEventListener('session.created', invalidate);
  source.addEventListener('session.terminated', invalidate);
  source.addEventListener('session.updated', invalidate);

  // EventSource auto-reconnects with built-in backoff on transient errors.
  // We only need to clean up on unmount.
  return () => {
    source.removeEventListener('session.created', invalidate);
    source.removeEventListener('session.terminated', invalidate);
    source.removeEventListener('session.updated', invalidate);
    source.close();
  };
}

// ---------------------------------------------------------------------------
// Adapter: ApiSession[] → SessionWorkspace
// ---------------------------------------------------------------------------

function toSessionWorkspace(rows: ApiSession[]): SessionWorkspace {
  const sessions: WorkerSession[] = rows.map(toWorkerSession);
  const projects = uniqueProjects(rows);
  const activeProjectId = projects[0]?.id ?? '';
  return {
    activeProjectId,
    orchestrators: [],
    projects,
    sessions,
  };
}

function toWorkerSession(row: ApiSession): WorkerSessionRecord {
  const title = row.title.trim() || `new agent: ${row.id}`;
  const recap = row.recap.trim();

  return {
    agent: row.agentPlugin,
    agentPluginId: row.agentPlugin,
    createdAt: row.createdAt,
    cwd: row.workspacePath,
    description: recap,
    id: row.id,
    issue: '',
    kind: 'worker',
    metadata: row.metadata ? JSON.stringify(row.metadata) : '',
    project: row.projectPath,
    recap,
    state: 'working',
    terminalSupported: true,
    title,
    updatedAt: row.updatedAt,
    workerId: row.id,
    zellijSession: row.zellijSession,
  };
}

function uniqueProjects(
  rows: ApiSession[]
): { id: string; name: string; cwd?: string }[] {
  const seen = new Map<string, { id: string; name: string; cwd?: string }>();
  for (const row of rows) {
    if (seen.has(row.projectPath)) {
      continue;
    }
    seen.set(row.projectPath, {
      id: row.projectPath,
      name: row.projectName || basename(row.projectPath),
      cwd: row.projectPath,
    });
  }
  return Array.from(seen.values());
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return idx === -1 ? path : path.slice(idx + 1);
}

export const fallbackHomeWorkspace: SessionWorkspace = {
  activeProjectId: '',
  orchestrators: [],
  projects: [],
  sessions: [],
};

export function stopSessionMutationOptions() {
  return {
    mutationFn: async (sessionId: string) => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to stop session: ${response.status}`);
      }
    },
  };
}

// renameSession sets (or clears) a session's persisted display name. An empty
// displayName reverts the session to its auto-derived title. The backend is
// the single source of truth: it persists to the SQLite store and emits a
// session.updated SSE event, so every open dashboard converges without the
// caller patching the cache directly.
export function renameSessionMutationOptions() {
  return {
    mutationFn: async (input: { sessionId: string; displayName: string }) => {
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(input.sessionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: input.displayName }),
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to rename session: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          `Failed to rename session: expected JSON, got ${contentType || 'unknown content type'}`
        );
      }

      apiSessionSchema.parse(await response.json());
    },
  };
}
