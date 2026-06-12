import { useState } from 'react';
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

function previewTargetsFetchMock() {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === '/api/browser-preview/targets') {
      return new Response(
        JSON.stringify({
          previewUrl: 'about:blank',
          targetUrl: 'http://localhost:3000/app',
        })
      );
    }
    return new Response('unexpected request', { status: 500 });
  });
}

function postBridgeMessage(
  iframe: HTMLIFrameElement,
  message: Record<string, unknown>
) {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { source: 'yyork-preview-bridge', version: 1, ...message },
      source: iframe.contentWindow,
    })
  );
}

// Mirrors the real canvas wiring: onUrlChange persists the URL, which flows
// back down as a new defaultUrl prop. The preview must treat that echo as
// its own navigation, not as a target switch that resets state.
function PersistingPreview(props: { onUrlChange?: (url: string) => void }) {
  const [persistedUrl, setPersistedUrl] = useState('http://localhost:3000/app');
  return (
    <CanvasWebPreview
      defaultUrl={persistedUrl}
      onUrlChange={(url) => {
        setPersistedUrl(url);
        props.onUrlChange?.(url);
      }}
    />
  );
}

test('bridge location changes drive the address bar without remounting the iframe', async () => {
  const fetchMock = previewTargetsFetchMock();
  vi.stubGlobal('fetch', fetchMock);
  const onUrlChange = vi.fn();

  render(<PersistingPreview onUrlChange={onUrlChange} />);

  const iframeLocator = page.getByTitle('Browser preview');
  await expect.element(iframeLocator).toBeVisible();
  const iframe = iframeLocator.element() as HTMLIFrameElement;
  const addressInput = page.getByPlaceholder('http://localhost:3000');
  const backButton = page.getByRole('button', { name: 'Go back' });

  await expect.element(backButton).toBeDisabled();

  // Unrelated DOM events (scrolling) must not touch navigation state.
  postBridgeMessage(iframe, {
    eventType: 'scroll',
    type: 'yyork:dom-event',
    url: 'http://localhost:3000/app',
  });
  await expect.element(addressInput).toHaveValue('http://localhost:3000/app');
  await expect.element(backButton).toBeDisabled();

  // SPA pushState inside the frame.
  postBridgeMessage(iframe, {
    type: 'yyork:location-changed',
    url: 'http://localhost:3000/about',
  });

  await expect.element(addressInput).toHaveValue('http://localhost:3000/about');
  await expect.element(backButton).toBeEnabled();
  expect(onUrlChange).toHaveBeenLastCalledWith('http://localhost:3000/about');

  // Same iframe element, and the preview target was registered exactly once:
  // the frame-originated navigation neither re-registered nor remounted.
  expect(iframeLocator.element()).toBe(iframe);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('toolbar back and forward rebind the frame to the recorded entry', async () => {
  const user = setupUser();
  const fetchMock = previewTargetsFetchMock();
  vi.stubGlobal('fetch', fetchMock);
  const onUrlChange = vi.fn();

  render(<PersistingPreview onUrlChange={onUrlChange} />);

  const iframeLocator = page.getByTitle('Browser preview');
  await expect.element(iframeLocator).toBeVisible();
  const iframe = iframeLocator.element() as HTMLIFrameElement;
  const addressInput = page.getByPlaceholder('http://localhost:3000');

  postBridgeMessage(iframe, {
    type: 'yyork:location-changed',
    url: 'http://localhost:3000/about',
  });
  await expect.element(addressInput).toHaveValue('http://localhost:3000/about');

  await user.click(page.getByRole('button', { name: 'Go back' }));

  await expect.element(addressInput).toHaveValue('http://localhost:3000/app');
  await expect
    .element(page.getByRole('button', { name: 'Go forward' }))
    .toBeEnabled();
  expect(onUrlChange).toHaveBeenLastCalledWith('http://localhost:3000/app');
  // Going back is user-driven: the target re-registers and the frame remounts.
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  await vi.waitFor(() => {
    expect(iframeLocator.element()).not.toBe(iframe);
  });

  await user.click(page.getByRole('button', { name: 'Go forward' }));

  await expect.element(addressInput).toHaveValue('http://localhost:3000/about');
  await expect
    .element(page.getByRole('button', { name: 'Go forward' }))
    .toBeDisabled();
  await vi.waitFor(() => {
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

test('a frame-originated return to the previous entry moves the index back', async () => {
  const fetchMock = previewTargetsFetchMock();
  vi.stubGlobal('fetch', fetchMock);

  render(<CanvasWebPreview defaultUrl="http://localhost:3000/app" />);

  const iframeLocator = page.getByTitle('Browser preview');
  await expect.element(iframeLocator).toBeVisible();
  const iframe = iframeLocator.element() as HTMLIFrameElement;
  const backButton = page.getByRole('button', { name: 'Go back' });
  const forwardButton = page.getByRole('button', { name: 'Go forward' });

  postBridgeMessage(iframe, {
    type: 'yyork:location-changed',
    url: 'http://localhost:3000/about',
  });
  await expect.element(backButton).toBeEnabled();

  // The app inside the frame navigates back (popstate). The history index
  // moves back instead of pushing a duplicate forward entry.
  postBridgeMessage(iframe, {
    type: 'yyork:location-changed',
    url: 'http://localhost:3000/app',
  });

  await expect.element(backButton).toBeDisabled();
  await expect.element(forwardButton).toBeEnabled();
  expect(iframeLocator.element()).toBe(iframe);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
