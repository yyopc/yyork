import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSendAnnotationsPath,
  sendAnnotations,
} from '@/features/home/data/annotations';

describe('annotations data helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds session-scoped annotation send paths', () => {
    expect(
      createSendAnnotationsPath({ projectId: 'project-a', sessionId: 'ao/1' })
    ).toBe('/api/annotations/ao%2F1?project=project-a');
    expect(createSendAnnotationsPath({ sessionId: 'ao-1' })).toBe(
      '/api/annotations/ao-1'
    );
  });

  it('posts annotations to the selected session', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ delivered: 1 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendAnnotations({
        annotations: [
          {
            comment: 'tighten spacing',
            element: 'button',
            elementPath: 'main > button',
            id: 'a1',
            selectedText: 'Ship',
          },
        ],
        projectId: 'project-a',
        sessionId: 'ao-1',
      })
    ).resolves.toEqual({ delivered: 1 });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/annotations/ao-1?project=project-a',
      expect.objectContaining({
        body: JSON.stringify({
          annotations: [
            {
              comment: 'tighten spacing',
              element: 'button',
              elementPath: 'main > button',
              id: 'a1',
              selectedText: 'Ship',
            },
          ],
        }),
        method: 'POST',
      })
    );
  });
});
