export type BrowserDomEvent = {
  element?: string;
  eventType: string;
  selector?: string;
  text?: string;
  timestamp: string;
  url?: string;
  value?: string;
  x?: number;
  y?: number;
};

export type BrowserPreviewUrlResult = {
  error?: string;
  url: string;
};

export type BrowserPreviewTarget = {
  previewUrl: string;
  targetUrl: string;
};

export type BrowserPreviewBridgeMessage = {
  element?: string;
  error?: string;
  eventType?: string;
  scope?: 'all' | 'cache' | 'cookies';
  selector?: string;
  source: 'yyork-preview-bridge';
  text?: string;
  timestamp?: string;
  type:
    | 'yyork:dom-event'
    | 'yyork:location-changed'
    | 'yyork:preview-ready'
    | 'yyork:storage-clear-failed'
    | 'yyork:storage-cleared';
  url?: string;
  value?: string;
  version?: number;
  x?: number;
  y?: number;
};

export type BrowserPreviewAnnotation = {
  boundingBox?: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  comment?: string;
  cssClasses?: string;
  element?: string;
  elementPath?: string;
  fullPath?: string;
  id?: string;
  intent?: string;
  reactComponents?: string;
  selectedText?: string;
  severity?: string;
  timestamp?: number;
  x?: number;
  y?: number;
};

export type BrowserPreviewAgentationMessage = {
  annotation?: BrowserPreviewAnnotation;
  annotations?: BrowserPreviewAnnotation[];
  markdown?: string;
  output?: string;
  source: 'yyork-preview-agentation';
  timestamp?: string;
  type:
    | 'yyork:agentation-ready'
    | 'yyork:annotation-added'
    | 'yyork:annotation-deleted'
    | 'yyork:annotation-updated'
    | 'yyork:annotations-cleared'
    | 'yyork:annotations-copied'
    | 'yyork:annotations-submitted';
  url?: string;
  version?: number;
};

export type BrowserPreviewMessage =
  | BrowserPreviewAgentationMessage
  | BrowserPreviewBridgeMessage;

const unsupportedPreviewURLMessage =
  'yyork Browser only supports localhost, loopback, wildcard bind, and *.localhost preview URLs.';

export function normalizePreviewUrlInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `http://${trimmed}`;
}

export function validatePreviewUrlInput(
  value: string
): BrowserPreviewUrlResult {
  const normalized = normalizePreviewUrlInput(value);
  if (!normalized) {
    return { url: '' };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return {
      error: 'Enter a valid preview URL.',
      url: '',
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      error: 'yyork Browser only supports HTTP and HTTPS preview URLs.',
      url: '',
    };
  }

  if (!isLocalPreviewHostname(parsed.hostname)) {
    return {
      error: unsupportedPreviewURLMessage,
      url: '',
    };
  }

  return { url: parsed.href };
}

export function isLocalPreviewHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized === '::' ||
    normalized === '0.0.0.0' ||
    normalized.startsWith('127.')
  );
}

export async function registerBrowserPreviewTarget(
  url: string,
  options?: { previewName?: string; signal?: AbortSignal }
): Promise<BrowserPreviewTarget> {
  const response = await fetch('/api/browser-preview/targets', {
    body: JSON.stringify({ previewName: options?.previewName, url }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: options?.signal,
  });

  if (!response.ok) {
    throw new Error(
      (await response.text()) || 'Preview target registration failed.'
    );
  }

  return (await response.json()) as BrowserPreviewTarget;
}

export function isBrowserPreviewBridgeMessage(
  value: unknown
): value is BrowserPreviewBridgeMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;
  return (
    message.source === 'yyork-preview-bridge' &&
    typeof message.type === 'string' &&
    message.type.startsWith('yyork:')
  );
}

export function isBrowserPreviewAgentationMessage(
  value: unknown
): value is BrowserPreviewAgentationMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const message = value as Record<string, unknown>;
  return (
    message.source === 'yyork-preview-agentation' &&
    typeof message.type === 'string' &&
    message.type.startsWith('yyork:')
  );
}

export function isBrowserPreviewMessage(
  value: unknown
): value is BrowserPreviewMessage {
  return (
    isBrowserPreviewBridgeMessage(value) ||
    isBrowserPreviewAgentationMessage(value)
  );
}
