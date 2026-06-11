import { afterEach, describe, expect, it, vi } from 'vitest';

import { renameSessionMutationOptions } from '@/features/home/data/workspace';

describe('renameSessionMutationOptions', () => {
  afterEach(() => {
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
