import { afterEach, describe, expect, it, vi } from 'vitest';

import { sessionCanvasDiffQueryOptions } from '@/features/home/data/canvas-diff';

describe('sessionCanvasDiffQueryOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads project-scoped session diffs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        baseLabel: 'HEAD',
        cwd: '/tmp/worktree',
        files: [
          {
            additions: 2,
            deletions: 1,
            path: 'internal/web/src/main.tsx',
            status: 'modified',
          },
        ],
        generatedAt: '2026-06-07T00:00:00Z',
        patch:
          'diff --git a/internal/web/src/main.tsx b/internal/web/src/main.tsx\n',
        target: {
          kind: 'session',
          projectId: '/repo/yyork',
          sessionId: 'v042rv',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryFn = sessionCanvasDiffQueryOptions({
      enabled: true,
      projectId: '/repo/yyork',
      sessionId: 'v042rv',
    }).queryFn;

    if (!queryFn) {
      throw new Error('expected queryFn to be defined');
    }

    await expect(queryFn({} as never)).resolves.toEqual({
      baseLabel: 'HEAD',
      cwd: '/tmp/worktree',
      files: [
        {
          additions: 2,
          deletions: 1,
          path: 'internal/web/src/main.tsx',
          status: 'modified',
        },
      ],
      generatedAt: '2026-06-07T00:00:00Z',
      patch:
        'diff --git a/internal/web/src/main.tsx b/internal/web/src/main.tsx\n',
      patchTruncated: false,
      target: {
        kind: 'session',
        projectId: '/repo/yyork',
        sessionId: 'v042rv',
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions/v042rv/canvas/diff?project=%2Frepo%2Fyyork',
      {
        headers: { Accept: 'application/json' },
      }
    );
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
    const queryFn = sessionCanvasDiffQueryOptions({
      enabled: true,
      projectId: '/repo/yyork',
      sessionId: 'v042rv',
    }).queryFn;

    if (!queryFn) {
      throw new Error('expected queryFn to be defined');
    }

    await expect(queryFn({} as never)).rejects.toThrow('expected JSON');
  });
});
