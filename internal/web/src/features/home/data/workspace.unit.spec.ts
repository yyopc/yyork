import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  homeWorkspaceQueryKey,
  parseHomeWorkspaceResponse,
  patchWorkspaceWithRemovedProject,
  removeProjectMutationOptions,
  renameSessionMutationOptions,
} from '@/features/home/data/workspace';

describe('removeProjectMutationOptions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('calls the backend project removal endpoint', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      removeProjectMutationOptions().mutationFn({
        projectId: 'p_yyork',
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p_yyork', {
      method: 'DELETE',
    });
  });
});

describe('patchWorkspaceWithRemovedProject', () => {
  it('removes the project and its sessions from the workspace cache', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(homeWorkspaceQueryKey, {
      activeProjectId: 'p_yyork',
      orchestrators: [
        { id: 'orch-yyork', project: 'p_yyork' },
        { id: 'orch-other', project: 'p_other' },
      ],
      projects: [
        {
          id: 'p_yyork',
          name: 'yyork',
          path: '/repo/yyork',
          workerWorkspaceMode: 'local',
        },
        {
          id: 'p_other',
          name: 'other',
          path: '/repo/other',
          workerWorkspaceMode: 'local',
        },
      ],
      sessions: [
        { id: 'worker-yyork', project: 'p_yyork' },
        { id: 'worker-other', project: 'p_other' },
      ],
    });

    patchWorkspaceWithRemovedProject(queryClient, 'p_yyork');

    expect(queryClient.getQueryData(homeWorkspaceQueryKey)).toMatchObject({
      activeProjectId: 'p_other',
      orchestrators: [{ id: 'orch-other', project: 'p_other' }],
      projects: [{ id: 'p_other' }],
      sessions: [{ id: 'worker-other', project: 'p_other' }],
    });
  });
});

describe('renameSessionMutationOptions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects an HTML fallback response even when the status is 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html><title>yyork</title>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
          status: 200,
        })
      )
    );

    await expect(
      renameSessionMutationOptions().mutationFn({
        displayName: 'Renamed session',
        sessionId: 'v042rv',
      })
    ).rejects.toThrow('expected JSON');
  });

  it('accepts the updated session JSON from the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        agentPlugin: 'claude-code',
        createdAt: '2026-06-06T07:45:41Z',
        id: 'v042rv',
        metadata: { displayName: 'Renamed session' },
        projectName: 'yyork',
        projectPath: '/repo/yyork',
        updatedAt: '2026-06-07T01:17:40Z',
        workspacePath: '/tmp/worktree',
        zellijSession: 'v042rv',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      renameSessionMutationOptions().mutationFn({
        displayName: 'Renamed session',
        projectId: '/repo/yyork',
        sessionId: 'v042rv',
      })
    ).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions/v042rv?project=%2Frepo%2Fyyork',
      {
        body: JSON.stringify({ displayName: 'Renamed session' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH',
      }
    );
  });
});

describe('parseHomeWorkspaceResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts legacy project records that expose cwd before path', () => {
    const workspace = parseHomeWorkspaceResponse({
      activeProjectId: '/repo/yyork',
      orchestrators: [],
      projects: [
        {
          cwd: '/repo/yyork',
          id: '/repo/yyork',
          name: 'yyork',
          workerWorkspaceMode: 'local',
        },
      ],
      sessions: [],
    });

    expect(workspace.projects[0]).toMatchObject({
      cwd: '/repo/yyork',
      path: '/repo/yyork',
    });
  });

  it('throws a product-safe error for malformed workspace records', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      parseHomeWorkspaceResponse({
        activeProjectId: '/repo/yyork',
        projects: [
          {
            id: '/repo/yyork',
            name: 'yyork',
            workerWorkspaceMode: 'local',
          },
        ],
        sessions: [],
      });
      throw new Error('Expected parseHomeWorkspaceResponse to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(
        'The local yyork server returned workspace data this UI cannot read. Restart yyork or refresh after the server rebuilds.'
      );
      expect((error as Error).message).not.toContain('expected');
    }

    expect(console.error).toHaveBeenCalledWith(
      'Invalid /api/workspace response',
      expect.any(Array)
    );
  });
});
