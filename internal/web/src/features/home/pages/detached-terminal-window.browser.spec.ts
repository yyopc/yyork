import { afterEach, expect, test, vi } from 'vitest';

import {
  getDetachedTerminalWindowName,
  openDetachedTerminalBrowserWindow,
} from './detached-terminal-window';

const originalDocumentPictureInPictureDescriptor =
  Object.getOwnPropertyDescriptor(window, 'documentPictureInPicture');

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDocumentPictureInPictureDescriptor) {
    Object.defineProperty(
      window,
      'documentPictureInPicture',
      originalDocumentPictureInPictureDescriptor
    );
    return;
  }

  Reflect.deleteProperty(window, 'documentPictureInPicture');
});

test('opens detached terminals with Document Picture-in-Picture when available', async () => {
  const pipWindow = makeFakeDetachedWindow();
  const requestWindow = vi.fn().mockResolvedValue(pipWindow);
  setDocumentPictureInPicture({
    requestWindow,
    window: null,
  });
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  const onAttachFromDetached = vi.fn();

  const result = await openDetachedTerminalBrowserWindow({
    hasOpenDocumentPictureInPictureWindow: false,
    href: '/terminal/session-1?detached=1',
    onAttachFromDetached,
    windowName: getDetachedTerminalWindowName('project:session-1'),
  });

  expect(result?.mode).toBe('document-picture-in-picture');
  expect(result?.popup).toBe(pipWindow);
  expect(requestWindow).toHaveBeenCalledWith({
    height: 800,
    width: 1200,
  });
  expect(openSpy).not.toHaveBeenCalled();
  expect(pipWindow.focus).toHaveBeenCalledOnce();
  expect(pipWindow.__yyorkDetachedTerminalAttach).toBe(onAttachFromDetached);

  const iframe = pipWindow.document.querySelector('iframe');
  expect(iframe?.title).toBe('Detached terminal');
  expect(iframe?.getAttribute('src')).toBe('/terminal/session-1?detached=1');
  expect(iframe?.getAttribute('allow')).toBe('clipboard-read; clipboard-write');
});

test('falls back to the existing popup window path without Document Picture-in-Picture', async () => {
  setDocumentPictureInPicture(undefined);
  const popup = makeFakeDetachedWindow();
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);

  const result = await openDetachedTerminalBrowserWindow({
    hasOpenDocumentPictureInPictureWindow: false,
    href: '/terminal/session-2?detached=1',
    onAttachFromDetached: () => {},
    windowName: getDetachedTerminalWindowName('project:session-2'),
  });

  expect(result?.mode).toBe('popup');
  expect(result?.popup).toBe(popup);
  expect(openSpy).toHaveBeenCalledWith(
    '/terminal/session-2?detached=1',
    'yyork-terminal-project_session-2',
    'popup=yes,width=1200,height=800'
  );
  expect(popup.focus).toHaveBeenCalledOnce();
});

test('uses the popup fallback instead of replacing an existing Picture-in-Picture terminal', async () => {
  const requestWindow = vi.fn();
  setDocumentPictureInPicture({
    requestWindow,
    window: makeFakeDetachedWindow(),
  });
  const popup = makeFakeDetachedWindow();
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup);

  const result = await openDetachedTerminalBrowserWindow({
    hasOpenDocumentPictureInPictureWindow: true,
    href: '/terminal/session-3?detached=1',
    onAttachFromDetached: () => {},
    windowName: getDetachedTerminalWindowName('project:session-3'),
  });

  expect(result?.mode).toBe('popup');
  expect(requestWindow).not.toHaveBeenCalled();
  expect(openSpy).toHaveBeenCalledOnce();
});

function setDocumentPictureInPicture(
  documentPictureInPicture: Partial<DocumentPictureInPicture> | undefined
) {
  Object.defineProperty(window, 'documentPictureInPicture', {
    configurable: true,
    value: documentPictureInPicture,
  });
}

function makeFakeDetachedWindow() {
  let closed = false;
  const fakeWindow = {
    addEventListener: vi.fn(),
    close: vi.fn(() => {
      closed = true;
    }),
    document: document.implementation.createHTMLDocument(''),
    focus: vi.fn(),
    get closed() {
      return closed;
    },
  };

  return fakeWindow as unknown as Window;
}
