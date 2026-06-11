import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import {
  type SessionWorkspace,
  workerSessionStates,
} from '@/features/home/domain/session-workspace';

export const homeWorkspaceQueryKey = ['home-workspace'] as const;

const workerSessionStateSchema = z.enum(workerSessionStates);
const terminalSessionKindSchema = z.enum(['orchestrator', 'worker']);

const projectOrchestratorSchema = z.object({
  cwd: z.string().optional(),
  id: z.string(),
  name: z.string(),
});

const workerSessionSchema = z
  .object({
    agent: z.string(),
    agentPluginId: z.string().optional(),
    createdAt: z.string().optional(),
    cwd: z.string().optional(),
    description: z.string(),
    id: z.string(),
    issue: z.string(),
    kind: terminalSessionKindSchema.optional(),
    metadata: z.string(),
    project: z.string(),
    recap: z.string(),
    selected: z.boolean().optional(),
    state: workerSessionStateSchema,
    terminalSupported: z.boolean().optional(),
    title: z.string(),
    updatedAt: z.string().optional(),
    workerId: z.string(),
    zellijSession: z.string().optional(),
  })
  .passthrough();

const sessionWorkspaceSchema = z.object({
  activeProjectId: z.string(),
  orchestrators: z.array(workerSessionSchema).optional(),
  projects: z.array(projectOrchestratorSchema),
  sessions: z.array(workerSessionSchema),
});

export function homeWorkspaceQueryOptions() {
  return queryOptions({
    enabled: typeof window !== 'undefined',
    queryFn: fetchHomeWorkspace,
    queryKey: homeWorkspaceQueryKey,
    // Orchestrator sessions can create workers from their own agent process,
    // outside the dashboard's SSE bus. Poll lightly so those sessions appear
    // without a manual refresh.
    refetchInterval: 3_000,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: 1_000,
  });
}

async function fetchHomeWorkspace(): Promise<SessionWorkspace> {
  const response = await fetch('/api/workspace', {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to load workspace: ${response.status}`);
  }
  return sessionWorkspaceSchema.parse(await response.json());
}

// ---------------------------------------------------------------------------
// SSE subscription
//
// subscribeToSessionEvents opens an EventSource against /api/events and
// invalidates the workspace query whenever yyork itself emits lifecycle or
// metadata events. Orchestrator-originated changes are picked up by the
// query's light polling interval. Returns a cleanup function.
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

export const fallbackHomeWorkspace: SessionWorkspace = {
  activeProjectId: '',
  orchestrators: [],
  projects: [],
  sessions: [],
};

export function stopSessionMutationOptions() {
  return {
    mutationFn: async (input: { projectId?: string; sessionId: string }) => {
      const params = new URLSearchParams();
      if (input.projectId) {
        params.set('project', input.projectId);
      }
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(input.sessionId)}${
          params.size > 0 ? `?${params.toString()}` : ''
        }`,
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
    mutationFn: async (input: {
      displayName: string;
      projectId?: string;
      sessionId: string;
    }) => {
      const params = new URLSearchParams();
      if (input.projectId) {
        params.set('project', input.projectId);
      }
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(input.sessionId)}${
          params.size > 0 ? `?${params.toString()}` : ''
        }`,
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

      await response.json();
    },
  };
}
