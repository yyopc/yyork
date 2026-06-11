import { useMutation } from '@tanstack/react-query';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CookieIcon,
  ExternalLinkIcon,
  HardDriveIcon,
  MoreVerticalIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
  SquareMousePointerIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Toggle } from '@/components/ui/toggle';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  type AnnotationPayload,
  sendAnnotationsMutationOptions,
} from '@/features/home/data/annotations';
import {
  type BrowserDomEvent,
  type BrowserPreviewAgentationMessage,
  type BrowserPreviewAnnotation,
  type BrowserPreviewMessage,
  type BrowserPreviewUrlResult,
  isBrowserPreviewMessage,
  registerBrowserPreviewTarget,
  validatePreviewUrlInput,
} from '@/features/home/data/browser-preview';

interface WebPreviewContextValue {
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
  domEvents: BrowserDomEvent[];
  domEventsOpen: boolean;
  error: string | null;
  iframeKey: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  loading: boolean;
  navigateTo: (url: string) => void;
  previewName?: string;
  recordFrameNavigation: (url: string) => void;
  reloadPreview: (
    hard?: boolean,
    storageScope?: 'cache' | 'cookies' | 'all'
  ) => void;
  runHistory: (direction: 'back' | 'forward') => void;
  setDomEventsOpen: (open: boolean) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  updateCurrentUrlFromFrame: () => void;
}

type HistoryEntry = {
  url: string;
};

interface PreviewState {
  domEvents: BrowserDomEvent[];
  error: string | null;
  history: HistoryEntry[];
  historyIndex: number;
  loading: boolean;
  sourceDefaultUrl?: string;
}

interface StagedAnnotation extends AnnotationPayload {
  key: string;
  sourceId?: string;
}

const maxDOMEvents = 200;
const WebPreviewContext = createContext<WebPreviewContextValue | null>(null);

export function CanvasWebPreview(props: {
  defaultUrl?: string;
  onUrlChange?: (url: string) => void;
  previewName?: string;
  projectId?: string;
  sessionId?: string;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewState, setPreviewState] = useState(() =>
    createPreviewState(props.defaultUrl)
  );
  const [iframeKey, setIframeKey] = useState(0);
  const [domEventsOpen, setDomEventsOpen] = useState(false);
  const [annotations, setAnnotations] = useState<StagedAnnotation[]>([]);
  const annotationKeyRef = useRef(0);
  const sendMutation = useMutation(sendAnnotationsMutationOptions());
  const activePreviewState = getActivePreviewState(
    previewState,
    props.defaultUrl
  );
  const { domEvents, error, history, historyIndex, loading } =
    activePreviewState;

  function updatePreviewState(update: (current: PreviewState) => PreviewState) {
    setPreviewState((current) =>
      update(getActivePreviewState(current, props.defaultUrl))
    );
  }

  function setPreviewError(nextError: string | null) {
    updatePreviewState((current) => ({ ...current, error: nextError }));
  }

  function setPreviewLoading(nextLoading: boolean) {
    updatePreviewState((current) => ({ ...current, loading: nextLoading }));
  }

  const currentEntry = historyIndex >= 0 ? history[historyIndex] : undefined;
  const currentUrl = currentEntry?.url ?? '';
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  useEffect(() => {
    setAnnotations([]);
  }, [props.sessionId, currentUrl]);

  function nextAnnotationKey() {
    annotationKeyRef.current += 1;
    return `annotation-${annotationKeyRef.current}`;
  }

  function commitNavigation(result: BrowserPreviewUrlResult) {
    if (!result.url) {
      updatePreviewState((current) => ({
        ...current,
        error: result.error ?? null,
        loading: false,
      }));
      return;
    }

    updatePreviewState((current) => {
      const nextIndex = Math.max(0, current.historyIndex + 1);

      return {
        ...current,
        domEvents: [],
        error: null,
        history: [...current.history.slice(0, nextIndex), { url: result.url }],
        historyIndex: nextIndex,
        loading: true,
      };
    });
    props.onUrlChange?.(result.url);
  }

  function navigateTo(nextUrl: string) {
    const result = validatePreviewUrlInput(nextUrl);
    commitNavigation(result);
    if (result.error) {
      toast.error(result.error);
    }
  }

  function runHistory(direction: 'back' | 'forward') {
    updatePreviewState((current) => {
      const nextIndex =
        direction === 'back'
          ? Math.max(0, current.historyIndex - 1)
          : Math.min(current.history.length - 1, current.historyIndex + 1);

      return {
        ...current,
        error: null,
        historyIndex: nextIndex,
        loading: true,
      };
    });
  }

  function reloadPreview(
    hard = false,
    storageScope: 'cache' | 'cookies' | 'all' = 'all'
  ) {
    if (!currentUrl) {
      return;
    }
    setPreviewError(null);
    setPreviewLoading(true);
    if (hard) {
      void clearCurrentFrameStorage(iframeRef.current, storageScope).finally(
        () => {
          setIframeKey((current) => current + 1);
        }
      );
      return;
    }
    setIframeKey((current) => current + 1);
  }

  function recordFrameNavigation(nextUrl: string) {
    const result = validatePreviewUrlInput(nextUrl);
    if (!result.url) {
      return;
    }

    if (result.url === currentUrl) {
      setPreviewLoading(false);
      return;
    }

    updatePreviewState((current) => {
      const activeUrl = current.history[current.historyIndex]?.url;
      if (activeUrl === result.url) {
        return { ...current, loading: false };
      }

      const nextIndex = Math.max(0, current.historyIndex + 1);
      return {
        ...current,
        error: null,
        history: [...current.history.slice(0, nextIndex), { url: result.url }],
        historyIndex: nextIndex,
        loading: false,
      };
    });
    props.onUrlChange?.(result.url);
  }

  function updateCurrentUrlFromFrame() {
    const frameUrl = readableFrameURL(iframeRef.current);
    if (!frameUrl || frameUrl === currentUrl) {
      return;
    }

    const result = validatePreviewUrlInput(frameUrl);
    if (!result.url) {
      return;
    }
    commitNavigation(result);
  }

  function sendAnnotationsToAgent(items: StagedAnnotation[] = annotations) {
    if (items.length === 0 || sendMutation.isPending) {
      return;
    }

    if (!props.sessionId) {
      toast.error('Select a worker session to send annotations.');
      return;
    }

    sendMutation.mutate(
      {
        annotations: items.map(toAnnotationRequestPayload),
        projectId: props.projectId,
        sessionId: props.sessionId,
      },
      {
        onError: (errorValue) => {
          toast.error(
            errorValue instanceof Error
              ? errorValue.message
              : 'Failed to send annotations.'
          );
        },
        onSuccess: (result) => {
          toast.success(
            `Sent ${result.delivered} annotation${result.delivered === 1 ? '' : 's'} to the agent.`
          );
          setAnnotations([]);
        },
      }
    );
  }

  function handleAgentationMessage(message: BrowserPreviewAgentationMessage) {
    if (message.type === 'yyork:agentation-ready') {
      return;
    }

    const annotation = message.annotation
      ? toStagedAnnotation(message.annotation, message.url, nextAnnotationKey())
      : undefined;
    const annotationsFromMessage =
      message.annotations?.map((item) =>
        toStagedAnnotation(item, message.url, nextAnnotationKey())
      ) ?? [];

    if (message.type === 'yyork:annotation-added' && annotation) {
      setAnnotations((current) => addOrUpdateAnnotation(current, annotation));
      return;
    }

    if (message.type === 'yyork:annotation-updated' && annotation) {
      setAnnotations((current) => addOrUpdateAnnotation(current, annotation));
      return;
    }

    if (message.type === 'yyork:annotation-deleted' && annotation) {
      setAnnotations((current) => removeAnnotation(current, annotation));
      return;
    }

    if (message.type === 'yyork:annotations-cleared') {
      setAnnotations([]);
      return;
    }

    if (message.type === 'yyork:annotations-submitted') {
      const submittedAnnotations =
        annotationsFromMessage.length > 0
          ? annotationsFromMessage
          : annotations;
      sendAnnotationsToAgent(submittedAnnotations);
    }
  }

  const context: WebPreviewContextValue = {
    canGoBack,
    canGoForward,
    currentUrl,
    domEvents,
    domEventsOpen,
    error,
    iframeKey,
    iframeRef,
    loading,
    navigateTo,
    previewName: props.previewName,
    recordFrameNavigation,
    reloadPreview,
    runHistory,
    setDomEventsOpen,
    setError: setPreviewError,
    setLoading: setPreviewLoading,
    updateCurrentUrlFromFrame,
  };

  return (
    <WebPreviewContext value={context}>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
        <WebPreviewNavigation>
          <HistoryButton direction="back" />
          <HistoryButton direction="forward" />
          <ReloadPreviewButton />
          <WebPreviewUrl placeholder="http://localhost:3000" />
          <DomEventsToggle />
          <OpenExternalButton />
          <BrowserMenuButton />
        </WebPreviewNavigation>
        <BrowserViewport
          onAgentationMessage={handleAgentationMessage}
          onDOMEvent={(event) => {
            updatePreviewState((current) => ({
              ...current,
              domEvents: [...current.domEvents, event].slice(-maxDOMEvents),
            }));
          }}
        />
        {annotations.length > 0 || sendMutation.isPending ? (
          <AnnotationTray
            annotations={annotations}
            canSend={Boolean(props.sessionId)}
            pending={sendMutation.isPending}
            onClear={() => setAnnotations([])}
            onRemove={(annotation) =>
              setAnnotations((current) => removeAnnotation(current, annotation))
            }
            onSend={() => sendAnnotationsToAgent()}
          />
        ) : null}
        {domEventsOpen ? <DomEventsTray events={domEvents} /> : null}
      </div>
    </WebPreviewContext>
  );
}

function HistoryButton(props: { direction: 'back' | 'forward' }) {
  const { canGoBack, canGoForward, runHistory } = useWebPreview();
  const disabled = props.direction === 'back' ? !canGoBack : !canGoForward;
  const tooltip = props.direction === 'back' ? 'Go back' : 'Go forward';

  return (
    <WebPreviewNavigationButton
      tooltip={tooltip}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          runHistory(props.direction);
        }
      }}
    >
      {props.direction === 'back' ? (
        <ChevronLeftIcon aria-hidden="true" />
      ) : (
        <ChevronRightIcon aria-hidden="true" />
      )}
    </WebPreviewNavigationButton>
  );
}

function ReloadPreviewButton() {
  const { currentUrl, reloadPreview } = useWebPreview();
  const disabled = !currentUrl.trim();

  return (
    <WebPreviewNavigationButton
      tooltip="Reload"
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          reloadPreview();
        }
      }}
    >
      <RefreshCcwIcon aria-hidden="true" />
    </WebPreviewNavigationButton>
  );
}

function OpenExternalButton() {
  const { currentUrl } = useWebPreview();
  const disabled = !currentUrl.trim();

  return (
    <WebPreviewNavigationButton
      tooltip="Open externally"
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          window.open(currentUrl, '_blank', 'noopener,noreferrer');
        }
      }}
    >
      <ExternalLinkIcon aria-hidden="true" />
    </WebPreviewNavigationButton>
  );
}

function BrowserMenuButton() {
  const { currentUrl, reloadPreview } = useWebPreview();
  const disabled = !currentUrl.trim();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="rounded-sm shadow-none"
            aria-label="Browser options"
          />
        }
      >
        <MoreVerticalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem
          disabled={disabled}
          onClick={() => reloadPreview(true)}
        >
          <RotateCcwIcon aria-hidden="true" />
          Hard reload
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={disabled}
          onClick={() => {
            reloadPreview(true, 'cookies');
          }}
        >
          <CookieIcon aria-hidden="true" />
          Clear cookies
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={disabled}
          onClick={() => {
            reloadPreview(true, 'cache');
          }}
        >
          <HardDriveIcon aria-hidden="true" />
          Clear cache
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DomEventsToggle() {
  const { domEvents, domEventsOpen, setDomEventsOpen } = useWebPreview();
  const tooltip = domEventsOpen ? 'Hide DOM events' : 'Show DOM events';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            size={domEventsOpen ? 'sm' : 'icon-sm'}
            className={cn(
              'ms-auto rounded-sm font-normal shadow-none',
              domEventsOpen &&
                'border-positive-500/60 bg-positive-500/10 text-positive-500 hover:border-positive-500/70 hover:bg-positive-500/15 hover:text-positive-500 data-pressed:border-positive-500/60 data-pressed:bg-positive-500/10 data-pressed:text-positive-500'
            )}
            pressed={domEventsOpen}
            aria-label={tooltip}
            onPressedChange={setDomEventsOpen}
          />
        }
      >
        <SquareMousePointerIcon aria-hidden="true" data-icon="inline-start" />
        {domEventsOpen ? <span>{domEvents.length}</span> : null}
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function BrowserViewport(props: {
  onAgentationMessage: (message: BrowserPreviewAgentationMessage) => void;
  onDOMEvent: (event: BrowserDomEvent) => void;
}) {
  const [frameState, setFrameState] = useState<{
    frameUrl: string;
    sourceUrl: string;
  }>({ frameUrl: '', sourceUrl: '' });
  const {
    currentUrl,
    error,
    iframeKey,
    iframeRef,
    loading,
    previewName,
    recordFrameNavigation,
    setError,
    setLoading,
    updateCurrentUrlFromFrame,
  } = useWebPreview();
  const frameUrl =
    frameState.sourceUrl === currentUrl ? frameState.frameUrl : '';
  const handlePreviewRegistrationError = useEffectEvent(
    (errorValue: unknown) => {
      const message =
        errorValue instanceof Error
          ? errorValue.message.trim()
          : 'Preview target registration failed.';
      setError(message || 'Preview target registration failed.');
      setLoading(false);
    }
  );
  const handleFrameLoad = useEffectEvent((activeFrame: HTMLIFrameElement) => {
    setLoading(false);
    updateCurrentUrlFromFrame();
    const cleanup = attachDOMEventBridge(activeFrame, props.onDOMEvent);
    if (!cleanup) {
      return;
    }
    activeFrame.addEventListener('beforeunload', cleanup, { once: true });
  });
  const handleFrameError = useEffectEvent(() => {
    setLoading(false);
    setError('Preview failed to load.');
  });
  const handlePreviewBridgeMessage = useEffectEvent(
    (message: BrowserPreviewMessage) => {
      if (message.source === 'yyork-preview-bridge') {
        if (message.type === 'yyork:preview-ready') {
          setLoading(false);
        }
        if (message.type === 'yyork:location-changed' && message.url) {
          recordFrameNavigation(message.url);
        }
        if (message.type === 'yyork:dom-event') {
          props.onDOMEvent(toBrowserDOMEventFromBridge(message));
        }
        if (message.type === 'yyork:storage-clear-failed') {
          setError(message.error ?? 'Preview storage could not be cleared.');
        }
        return;
      }

      if (message.type !== 'yyork:agentation-ready') {
        props.onDOMEvent(toBrowserDOMEventFromAgentation(message));
        props.onAgentationMessage(message);
      }
    }
  );

  useEffect(() => {
    if (!currentUrl) {
      return;
    }

    const controller = new AbortController();

    void registerBrowserPreviewTarget(currentUrl, {
      previewName,
      signal: controller.signal,
    })
      .then((target) => {
        setFrameState({
          frameUrl: target.previewUrl,
          sourceUrl: currentUrl,
        });
      })
      .catch((errorValue: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        handlePreviewRegistrationError(errorValue);
      });

    return () => controller.abort();
  }, [currentUrl, previewName]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !frameUrl) {
      return;
    }
    const activeFrame = frame;

    function handleLoad() {
      handleFrameLoad(activeFrame);
    }

    function handleError() {
      handleFrameError();
    }

    activeFrame.addEventListener('load', handleLoad);
    activeFrame.addEventListener('error', handleError);
    return () => {
      activeFrame.removeEventListener('load', handleLoad);
      activeFrame.removeEventListener('error', handleError);
    };
  }, [frameUrl, iframeKey, iframeRef]);

  useEffect(() => {
    function handleBridgeMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      if (!isBrowserPreviewMessage(event.data)) {
        return;
      }

      handlePreviewBridgeMessage(event.data);
    }

    window.addEventListener('message', handleBridgeMessage);
    return () => window.removeEventListener('message', handleBridgeMessage);
  }, [iframeRef]);

  return (
    <div className="relative min-h-0 w-full flex-1 bg-muted/20">
      {currentUrl && frameUrl ? (
        <iframe
          key={`${iframeKey}:${frameUrl}`}
          ref={iframeRef}
          title="Browser preview"
          src={frameUrl}
          sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-same-origin allow-scripts"
          className="block size-full border-0 bg-background"
        />
      ) : currentUrl ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Preparing local preview
        </div>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Enter a local preview URL
        </div>
      )}
      {loading ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-x-3 bottom-3 rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function DomEventsTray(props: { events: BrowserDomEvent[] }) {
  const events = props.events.slice(-60).reverse();

  return (
    <div className="flex max-h-[34%] min-h-0 shrink-0 flex-col border-t border-border bg-muted/20">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="font-medium">DOM events</span>
        <span className="text-muted-foreground">{props.events.length}</span>
      </div>
      {events.length === 0 ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          No events captured yet
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto">
          {events.map((event, index) => (
            <li
              key={`${event.timestamp}:${index}`}
              className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 px-3 py-2 text-xs"
            >
              <span className="font-medium text-foreground">
                {event.eventType}
              </span>
              <span className="min-w-0 text-muted-foreground">
                <span className="me-2">{formatEventTime(event.timestamp)}</span>
                {event.selector ? (
                  <code className="rounded-sm bg-background/80 px-1">
                    {event.selector}
                  </code>
                ) : null}
                {event.value || event.text ? (
                  <span className="ms-2 break-words text-foreground">
                    {event.value || event.text}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AnnotationTray(props: {
  annotations: StagedAnnotation[];
  canSend: boolean;
  onClear: () => void;
  onRemove: (annotation: StagedAnnotation) => void;
  onSend: () => void;
  pending: boolean;
}) {
  const count = props.annotations.length;
  const canSend = props.canSend && count > 0 && !props.pending;

  return (
    <div className="flex max-h-[34%] min-h-0 shrink-0 flex-col border-t border-border bg-muted/20">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="font-medium">
          {count} annotation{count === 1 ? '' : 's'} staged
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-sm"
            disabled={count === 0 || props.pending}
            onClick={props.onClear}
          >
            <Trash2Icon aria-hidden="true" data-icon="inline-start" />
            Clear
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-sm"
            disabled={!canSend}
            onClick={props.onSend}
          >
            <SendHorizontalIcon aria-hidden="true" data-icon="inline-start" />
            {props.pending ? 'Sending...' : 'Send to agent'}
          </Button>
        </div>
      </div>
      <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto">
        {props.annotations.map((annotation) => (
          <li
            key={annotation.key}
            className="flex items-start gap-2 px-3 py-2 text-xs"
          >
            <div className="min-w-0 flex-1">
              <p className="break-words">
                {annotation.comment ||
                  annotation.selectedText ||
                  annotation.element ||
                  'Annotation'}
              </p>
              {annotation.element || annotation.elementPath ? (
                <p className="mt-0.5 truncate text-muted-foreground">
                  {annotation.element} <code>{annotation.elementPath}</code>
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="rounded-sm"
              aria-label="Remove annotation"
              disabled={props.pending}
              onClick={() => props.onRemove(annotation)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WebPreviewNavigation({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex min-h-14 w-full shrink-0 items-center gap-1 border-b border-border p-3',
        className
      )}
      {...props}
    />
  );
}

function WebPreviewNavigationButton({
  children,
  className,
  tooltip,
  ...props
}: ComponentProps<typeof Button> & { tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn('rounded-sm shadow-none', className)}
            aria-label={tooltip}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function WebPreviewUrl(props: ComponentProps<typeof Input>) {
  const { currentUrl, navigateTo } = useWebPreview();
  const [draftState, setDraftState] = useState(() => ({
    draftUrl: currentUrl,
    sourceUrl: currentUrl,
  }));
  const draftUrl =
    draftState.sourceUrl === currentUrl ? draftState.draftUrl : currentUrl;

  return (
    <Input
      {...props}
      value={draftUrl}
      className="h-8 max-w-[66.666%] min-w-0 flex-1 rounded-md border-0"
      autoCapitalize="none"
      autoComplete="off"
      autoCorrect="off"
      onChange={(event) => {
        setDraftState({
          draftUrl: event.currentTarget.value,
          sourceUrl: currentUrl,
        });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          const nextUrl = event.currentTarget.value;
          setDraftState({ draftUrl: nextUrl, sourceUrl: nextUrl });
          navigateTo(nextUrl);
        }

        props.onKeyDown?.(event);
      }}
    />
  );
}

function validateInitialUrl(value: string | undefined) {
  if (!value?.trim()) {
    return { url: '' };
  }
  return validatePreviewUrlInput(value);
}

function createPreviewState(defaultUrl: string | undefined): PreviewState {
  const result = validateInitialUrl(defaultUrl);

  if (!result.url) {
    return {
      domEvents: [],
      error: result.error ?? null,
      history: [],
      historyIndex: -1,
      loading: false,
      sourceDefaultUrl: defaultUrl,
    };
  }

  return {
    domEvents: [],
    error: null,
    history: [{ url: result.url }],
    historyIndex: 0,
    loading: false,
    sourceDefaultUrl: defaultUrl,
  };
}

function getActivePreviewState(
  current: PreviewState,
  defaultUrl: string | undefined
) {
  if (current.sourceDefaultUrl === defaultUrl) {
    return current;
  }

  return createPreviewState(defaultUrl);
}

function attachDOMEventBridge(
  frame: HTMLIFrameElement,
  onDOMEvent: (event: BrowserDomEvent) => void
) {
  let doc: Document | null = null;
  let win: Window | null = null;
  try {
    doc = frame.contentDocument;
    win = frame.contentWindow;
  } catch {
    return null;
  }
  if (!doc || !win) {
    return null;
  }

  const eventTypes = [
    'click',
    'input',
    'change',
    'keydown',
    'focusin',
    'submit',
    'scroll',
  ] as const;
  const handler = (event: Event) => {
    onDOMEvent(toBrowserDOMEvent(event, win));
  };

  for (const eventType of eventTypes) {
    doc.addEventListener(eventType, handler, true);
  }
  win.addEventListener('scroll', handler, true);

  return () => {
    for (const eventType of eventTypes) {
      doc.removeEventListener(eventType, handler, true);
    }
    win.removeEventListener('scroll', handler, true);
  };
}

function toBrowserDOMEvent(event: Event, win: Window): BrowserDomEvent {
  const target =
    event.target instanceof Element
      ? event.target
      : win.document.documentElement;
  const inputTarget =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
      ? target
      : null;
  const text =
    target instanceof HTMLElement ? target.innerText?.slice(0, 160) : '';

  return {
    eventType: event.type,
    selector: elementSelector(target),
    text: text || undefined,
    timestamp: new Date().toISOString(),
    url: win.location.href,
    value: inputTarget?.value,
  };
}

function toBrowserDOMEventFromBridge(message: {
  element?: string;
  eventType?: string;
  selector?: string;
  text?: string;
  timestamp?: string;
  url?: string;
  value?: string;
  x?: number;
  y?: number;
}): BrowserDomEvent {
  return {
    element: message.element,
    eventType: message.eventType ?? 'event',
    selector: message.selector,
    text: message.text,
    timestamp: message.timestamp ?? new Date().toISOString(),
    url: message.url,
    value: message.value,
    x: message.x,
    y: message.y,
  };
}

function toBrowserDOMEventFromAgentation(
  message: BrowserPreviewAgentationMessage
): BrowserDomEvent {
  const annotations = message.annotations ?? [];
  const annotation =
    message.annotation ?? annotations[annotations.length - 1] ?? undefined;
  const boundingBox = annotation?.boundingBox;
  const text =
    annotation?.comment ??
    annotation?.selectedText ??
    message.markdown ??
    message.output;

  return {
    element: annotation?.element,
    eventType: message.type.replace(/^yyork:/, ''),
    selector: annotation?.fullPath ?? annotation?.elementPath,
    text,
    timestamp: message.timestamp ?? new Date().toISOString(),
    url: message.url,
    value: annotation?.id,
    x: boundingBox?.x ?? annotation?.x,
    y: boundingBox?.y ?? annotation?.y,
  };
}

function toStagedAnnotation(
  annotation: BrowserPreviewAnnotation,
  url: string | undefined,
  key: string
): StagedAnnotation {
  return {
    comment: annotation.comment,
    element: annotation.element,
    elementPath: annotation.fullPath ?? annotation.elementPath,
    id: annotation.id,
    intent: annotation.intent,
    key,
    reactComponents: annotation.reactComponents,
    selectedText: annotation.selectedText,
    severity: annotation.severity,
    sourceId: annotation.id,
    url,
  };
}

function addOrUpdateAnnotation(
  current: StagedAnnotation[],
  next: StagedAnnotation
) {
  if (!next.sourceId) {
    return [...current, next];
  }

  const index = current.findIndex((item) => item.sourceId === next.sourceId);
  if (index === -1) {
    return [...current, next];
  }

  return current.map((item, itemIndex) =>
    itemIndex === index ? { ...next, key: item.key } : item
  );
}

function removeAnnotation(
  current: StagedAnnotation[],
  annotation: StagedAnnotation
) {
  if (annotation.sourceId) {
    return current.filter((item) => item.sourceId !== annotation.sourceId);
  }

  return current.filter((item) => item.key !== annotation.key);
}

function toAnnotationRequestPayload(
  annotation: StagedAnnotation
): AnnotationPayload {
  return {
    comment: annotation.comment,
    element: annotation.element,
    elementPath: annotation.elementPath,
    id: annotation.id,
    intent: annotation.intent,
    reactComponents: annotation.reactComponents,
    selectedText: annotation.selectedText,
    severity: annotation.severity,
    url: annotation.url,
  };
}

function elementSelector(element: Element) {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }
  const testId = element.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${cssAttributeEscape(testId)}"]`;
  }
  const parts: string[] = [];
  let current: Element | null = element;
  while (
    current &&
    current.nodeType === Node.ELEMENT_NODE &&
    parts.length < 4
  ) {
    let selector = current.localName;
    if (current.classList.length > 0) {
      selector += `.${Array.from(current.classList)
        .slice(0, 2)
        .map((className) => CSS.escape(className))
        .join('.')}`;
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function cssAttributeEscape(value: string) {
  return value.replace(/["\\]/g, '\\$&');
}

async function clearCurrentFrameStorage(
  frame: HTMLIFrameElement | null,
  scope: 'cache' | 'cookies' | 'all' = 'all'
) {
  postPreviewStorageCommand(frame, scope);
  try {
    const win = frame?.contentWindow;
    if (!win) {
      await waitForPreviewStorageCommand();
      return;
    }
    if (scope === 'cache' || scope === 'all') {
      const cacheKeys = await win.caches?.keys();
      await Promise.all(cacheKeys?.map((key) => win.caches.delete(key)) ?? []);
      win.localStorage?.clear();
      win.sessionStorage?.clear();
    }
    if (scope === 'cookies' || scope === 'all') {
      for (const cookie of win.document.cookie.split(';')) {
        const name = cookie.split('=')[0]?.trim();
        if (name) {
          win.document.cookie = `${name}=; Max-Age=0; path=/`;
        }
      }
    }
  } catch {
    // Cross-origin iframes can be live previews, but storage control needs the
    // injected bridge to run inside the preview origin.
  }
  await waitForPreviewStorageCommand();
}

function postPreviewStorageCommand(
  frame: HTMLIFrameElement | null,
  scope: 'cache' | 'cookies' | 'all'
) {
  const messageType =
    scope === 'cache'
      ? 'yyork:clear-cache'
      : scope === 'cookies'
        ? 'yyork:clear-cookies'
        : 'yyork:clear-storage';
  frame?.contentWindow?.postMessage(
    {
      source: 'yyork-browser',
      type: messageType,
    },
    '*'
  );
}

function waitForPreviewStorageCommand() {
  return new Promise((resolve) => window.setTimeout(resolve, 120));
}

function readableFrameURL(frame: HTMLIFrameElement | null) {
  try {
    return frame?.contentWindow?.location.href ?? '';
  } catch {
    return '';
  }
}

function formatEventTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function useWebPreview() {
  const context = use(WebPreviewContext);

  if (!context) {
    throw new Error(
      'WebPreview components must be used within CanvasWebPreview'
    );
  }

  return context;
}
