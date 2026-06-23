import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  sessionFileContentQueryOptions,
  sessionFilesQueryOptions,
} from '@/features/home/data/session-files';

describe('sessionFilesQueryOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads project-scoped session files', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        gitStatus: [{ path: 'internal/web/src/main.tsx', status: 'modified' }],
        paths: ['README.md', 'internal/web/src/main.tsx'],
        workspacePath: '/tmp/worktree',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryFn = sessionFilesQueryOptions({
      enabled: true,
      projectId: '/repo/yyork',
      sessionId: 'v042rv',
    }).queryFn;

    if (!queryFn) {
      throw new Error('expected queryFn to be defined');
    }

    await expect(queryFn({} as never)).resolves.toEqual({
      gitStatus: [{ path: 'internal/web/src/main.tsx', status: 'modified' }],
      paths: ['README.md', 'internal/web/src/main.tsx'],
      truncated: false,
      workspacePath: '/tmp/worktree',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions/v042rv/files?project=%2Frepo%2Fyyork',
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
    const queryFn = sessionFilesQueryOptions({
      enabled: true,
      projectId: '/repo/yyork',
      sessionId: 'v042rv',
    }).queryFn;

    if (!queryFn) {
      throw new Error('expected queryFn to be defined');
    }

    await expect(queryFn({} as never)).rejects.toThrow('expected JSON');
  });

  it('loads project-scoped file contents', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        contents: 'pre-commit:\n',
        path: 'lefthook.yml',
        size: 12,
        workspacePath: '/tmp/worktree',
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryFn = sessionFileContentQueryOptions({
      enabled: true,
      path: 'lefthook.yml',
      projectId: '/repo/yyork',
      sessionId: 'v042rv',
    }).queryFn;

    if (!queryFn) {
      throw new Error('expected queryFn to be defined');
    }

    await expect(queryFn({} as never)).resolves.toEqual({
      binary: false,
      contents: 'pre-commit:\n',
      path: 'lefthook.yml',
      size: 12,
      truncated: false,
      workspacePath: '/tmp/worktree',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sessions/v042rv/files/content?path=lefthook.yml&project=%2Frepo%2Fyyork',
      {
        headers: { Accept: 'application/json' },
      }
    );
  });
});
