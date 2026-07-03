interface DocumentPictureInPictureOptions {
  disallowReturnToOpener?: boolean;
  height?: number;
  preferInitialWindowPlacement?: boolean;
  width?: number;
}

interface DocumentPictureInPicture extends EventTarget {
  readonly window: Window | null;
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
}

interface Window {
  __yyorkDetachedTerminalAttach?: (href: string) => void;
  readonly documentPictureInPicture?: DocumentPictureInPicture;
}
