import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { z } from 'zod';

import type { AgentHarnessId } from '@/features/home/domain/agent-harness';
import {
  type SessionWorkspace,
  sessionWorkspaceSchema,
  type WorkerWorkspaceMode,
  workerWorkspaceModeSchema,
} from '@/features/home/domain/session-workspace';

export const homeWorkspaceQueryKey = ['home-workspace'] as const;
const workspaceContractErrorMessage =
  'The local yyork server returned workspace data this UI cannot read. Restart yyork or refresh after the server rebuilds.';

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

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    console.error('Invalid /api/workspace JSON', error);
    throw new Error(
      'The local yyork server did not return workspace JSON. Refresh after yyork finishes starting.'
    );
  }

  return parseHomeWorkspaceResponse(payload);
}

export function parseHomeWorkspaceResponse(payload: unknown): SessionWorkspace {
  const parsed = sessionWorkspaceSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  console.error('Invalid /api/workspace response', parsed.error.issues);
  throw new Error(workspaceContractErrorMessage);
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

// createProject adds a project to the workspace by ensuring it has an
// orchestrator session. The path may be any directory inside a git repo; the
// backend resolves it to the repo root and returns the project's canonical id,
// path, name, and whether a new orchestrator was spawned. The spawn emits a
// session.created event, so every open dashboard converges via the SSE
// subscription without the caller patching the cache.
const createProjectResponseSchema = z.object({
  id: z.string(),
  path: z.string(),
  name: z.string(),
  created: z.boolean(),
});

export type CreateProjectResult = z.infer<typeof createProjectResponseSchema>;

/** Optimistically surface a newly added project before the workspace refetch. */
export function patchWorkspaceWithAddedProject(
  queryClient: QueryClient,
  result: CreateProjectResult
) {
  queryClient.setQueryData<SessionWorkspace>(
    homeWorkspaceQueryKey,
    (current) => {
      const workspace = current ?? fallbackHomeWorkspace;
      const hasProject = workspace.projects.some(
        (project) => project.id === result.id
      );

      if (hasProject) {
        return {
          ...workspace,
          activeProjectId: result.id,
        };
      }

      return {
        ...workspace,
        activeProjectId: result.id,
        projects: [
          ...workspace.projects,
          {
            id: result.id,
            name: result.name,
            cwd: result.path,
            path: result.path,
            workerWorkspaceMode: 'local' satisfies WorkerWorkspaceMode,
          },
        ],
      };
    }
  );
}

export function patchWorkspaceWithRemovedProject(
  queryClient: QueryClient,
  projectId: string
) {
  queryClient.setQueryData<SessionWorkspace>(
    homeWorkspaceQueryKey,
    (current) => {
      const workspace = current ?? fallbackHomeWorkspace;
      const projects = workspace.projects.filter(
        (project) => project.id !== projectId
      );

      return {
        ...workspace,
        activeProjectId:
          workspace.activeProjectId === projectId
            ? (projects[0]?.id ?? '')
            : workspace.activeProjectId,
        orchestrators: (workspace.orchestrators ?? []).filter(
          (session) => session.project !== projectId
        ),
        projects,
        sessions: workspace.sessions.filter(
          (session) => session.project !== projectId
        ),
      };
    }
  );
}

// chooseProjectDirectory opens the host machine's native folder picker and
// returns the absolute path the user selected, or null when they cancel.
// Browsers hide absolute paths from their own file APIs, so this round-trips to
// the local yyork server, which pops the OS dialog (macOS Finder) and hands the
// real path back.
const chooseDirectoryResponseSchema = z.object({ path: z.string() });

export function chooseProjectDirectoryMutationOptions() {
  return {
    mutationFn: async (): Promise<{ path: string } | null> => {
      const response = await fetch('/api/projects/choose-directory', {
        method: 'POST',
      });
      // 204 means the user dismissed the picker — a no-op, not an error.
      if (response.status === 204) {
        return null;
      }
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(
          detail || `Failed to open folder picker: ${response.status}`
        );
      }
      return chooseDirectoryResponseSchema.parse(await response.json());
    },
  };
}

export function createProjectMutationOptions() {
  return {
    mutationFn: async (input: {
      path: string;
      agentPlugin?: AgentHarnessId;
      workerAgentPlugin?: AgentHarnessId;
    }): Promise<CreateProjectResult> => {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: input.path,
          agentPlugin: input.agentPlugin,
          workerAgentPlugin: input.workerAgentPlugin,
        }),
      });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(detail || `Failed to add project: ${response.status}`);
      }
      return createProjectResponseSchema.parse(await response.json());
    },
  };
}

const updateProjectWorkerWorkspaceResponseSchema = z.object({
  projectId: z.string(),
  workerWorkspaceMode: workerWorkspaceModeSchema,
});

export function updateProjectWorkerWorkspaceMutationOptions() {
  return {
    mutationFn: async (input: {
      projectId: string;
      workerWorkspaceMode: WorkerWorkspaceMode;
    }) => {
      const response = await fetch('/api/projects/worker-workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: input.projectId,
          workerWorkspaceMode: input.workerWorkspaceMode,
        }),
      });
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(
          detail || `Failed to update worker workspace: ${response.status}`
        );
      }
      return updateProjectWorkerWorkspaceResponseSchema.parse(
        await response.json()
      );
    },
  };
}

export function removeProjectMutationOptions() {
  return {
    mutationFn: async (input: { projectId: string }) => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(input.projectId)}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const detail = (await response.text()).trim();
        throw new Error(
          detail || `Failed to remove project: ${response.status}`
        );
      }
    },
  };
}

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

// markSessionDone transitions an attended Prompt worker session into Done
// without stopping or hiding it. The backend validates the current state and
// emits session.updated so all dashboards converge through the normal refresh
// path.
export function markSessionDoneMutationOptions() {
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
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: 'done' }),
        }
      );
      if (!response.ok) {
        throw new Error(`Failed to mark session done: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error(
          `Failed to mark session done: expected JSON, got ${contentType || 'unknown content type'}`
        );
      }

      await response.json();
    },
  };
}
