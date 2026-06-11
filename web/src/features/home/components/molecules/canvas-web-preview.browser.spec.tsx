import { afterEach, expect, test, vi } from 'vitest';

import { page, render, setupUser } from '@/tests/utils';

import { CanvasWebPreview } from './canvas-web-preview';

afterEach(() => {
  vi.unstubAllGlobals();
});

test('stages Agentation messages and sends them to the selected agent session', async () => {
  const user = setupUser();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/browser-preview/targets') {
      return new Response(
        JSON.stringify({
          previewUrl: 'about:blank',
          targetUrl: 'http://localhost:3000/app',
        })
      );
    }

    if (url === '/api/annotations/session-1?project=project-a') {
      return new Response(JSON.stringify({ delivered: 1 }));
    }

    return new Response('unexpected request', { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <CanvasWebPreview
      defaultUrl="http://localhost:3000/app"
      projectId="project-a"
      sessionId="session-1"
    />
  );

  const iframeLocator = page.getByTitle('Browser preview');
  await expect.element(iframeLocator).toBeVisible();
  const iframe = iframeLocator.element() as HTMLIFrameElement;

  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        annotation: {
          comment: 'tighten spacing',
          element: 'button',
          elementPath: 'main > button',
          id: 'ann-1',
          selectedText: 'Ship',
        },
        source: 'yyork-preview-agentation',
        type: 'yyork:annotation-added',
        url: 'http://localhost:3000/app',
      },
      source: iframe.contentWindow,
    })
  );

  await expect.element(page.getByText('1 annotation staged')).toBeVisible();
  await user.click(page.getByRole('button', { name: 'Send to agent' }));

  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/annotations/session-1?project=project-a',
    expect.objectContaining({
      body: JSON.stringify({
        annotations: [
          {
            comment: 'tighten spacing',
            element: 'button',
            elementPath: 'main > button',
            id: 'ann-1',
            selectedText: 'Ship',
            url: 'http://localhost:3000/app',
          },
        ],
      }),
      method: 'POST',
    })
  );
});

test('sends Agentation submit events to the selected agent session', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/browser-preview/targets') {
      return new Response(
        JSON.stringify({
          previewUrl: 'about:blank',
          targetUrl: 'http://localhost:3000/app',
        })
      );
    }

    if (url === '/api/annotations/session-1?project=project-a') {
      return new Response(JSON.stringify({ delivered: 1 }));
    }

    return new Response('unexpected request', { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);

  render(
    <CanvasWebPreview
      defaultUrl="http://localhost:3000/app"
      projectId="project-a"
      sessionId="session-1"
    />
  );

  const iframeLocator = page.getByTitle('Browser preview');
  await expect.element(iframeLocator).toBeVisible();
  const iframe = iframeLocator.element() as HTMLIFrameElement;

  window.dispatchEvent(
    new MessageEvent('message', {
      data: {
        annotations: [
          {
            comment: 'raise contrast',
            element: 'h1',
            fullPath: 'main > h1',
            id: 'ann-2',
          },
        ],
        source: 'yyork-preview-agentation',
        type: 'yyork:annotations-submitted',
        url: 'http://localhost:3000/app',
      },
      source: iframe.contentWindow,
    })
  );

  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/annotations/session-1?project=project-a',
    expect.objectContaining({
      body: JSON.stringify({
        annotations: [
          {
            comment: 'raise contrast',
            element: 'h1',
            elementPath: 'main > h1',
            id: 'ann-2',
            url: 'http://localhost:3000/app',
          },
        ],
      }),
      method: 'POST',
    })
  );
});
