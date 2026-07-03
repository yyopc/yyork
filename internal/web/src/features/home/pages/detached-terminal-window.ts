export type DetachedTerminalWindowMode =
  | 'document-picture-in-picture'
  | 'popup';

export interface DetachedTerminalBrowserWindowResult {
  mode: DetachedTerminalWindowMode;
  popup: Window;
}

const detachedTerminalWindowFeatures = 'popup=yes,width=1200,height=800';
const detachedTerminalWindowSize = {
  height: 800,
  width: 1200,
} as const;

export async function openDetachedTerminalBrowserWindow(params: {
  href: string;
  hasOpenDocumentPictureInPictureWindow: boolean;
  onAttachFromDetached: (href: string) => void;
  windowName: string;
  win?: Window;
}): Promise<DetachedTerminalBrowserWindowResult | null> {
  const win = params.win ?? window;

  if (
    !params.hasOpenDocumentPictureInPictureWindow &&
    canRequestDocumentPictureInPicture(win)
  ) {
    try {
      const popup = await win.documentPictureInPicture.requestWindow({
        height: detachedTerminalWindowSize.height,
        width: detachedTerminalWindowSize.width,
      });
      mountDocumentPictureInPictureTerminal({
        href: params.href,
        onAttachFromDetached: params.onAttachFromDetached,
        pipWindow: popup,
      });
      popup.focus();
      return { mode: 'document-picture-in-picture', popup };
    } catch (error) {
      console.warn(
        'Could not open terminal in Document Picture-in-Picture',
        error
      );
    }
  }

  const popup = win.open(
    params.href,
    params.windowName,
    detachedTerminalWindowFeatures
  );

  if (!popup || popup.closed) {
    return null;
  }

  popup.focus();
  return { mode: 'popup', popup };
}

export function getDetachedTerminalWindowName(selectionKey: string) {
  return `yyork-terminal-${selectionKey.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function navigateDocumentPictureInPictureOpenerToHref(href: string) {
  if (window.parent === window) {
    return false;
  }

  try {
    const attach = window.parent.__yyorkDetachedTerminalAttach;
    if (!attach) {
      return false;
    }

    attach(href);
    return true;
  } catch {
    return false;
  }
}

function canRequestDocumentPictureInPicture(
  win: Window
): win is Window & { documentPictureInPicture: DocumentPictureInPicture } {
  return typeof win.documentPictureInPicture?.requestWindow === 'function';
}

function mountDocumentPictureInPictureTerminal(params: {
  href: string;
  onAttachFromDetached: (href: string) => void;
  pipWindow: Window;
}) {
  const { document: pipDocument } = params.pipWindow;
  pipDocument.title = 'yyork terminal';
  pipDocument.documentElement.style.height = '100%';
  pipDocument.body.style.height = '100%';
  pipDocument.body.style.margin = '0';
  pipDocument.body.style.overflow = 'hidden';
  pipDocument.body.style.background = 'Canvas';

  const iframe = pipDocument.createElement('iframe');
  iframe.title = 'Detached terminal';
  iframe.src = params.href;
  iframe.allow = 'clipboard-read; clipboard-write';
  iframe.style.border = '0';
  iframe.style.display = 'block';
  iframe.style.height = '100vh';
  iframe.style.width = '100vw';

  params.pipWindow.__yyorkDetachedTerminalAttach = params.onAttachFromDetached;
  pipDocument.body.replaceChildren(iframe);
  window.requestAnimationFrame(() => iframe.contentWindow?.focus());
}
