import { useMutation } from '@tanstack/react-query';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CookieIcon,
  ExternalLinkIcon,
  Globe,
  HardDriveIcon,
  MoreVerticalIcon,
  RefreshCcwIcon,
  RotateCcwIcon,
  SendHorizontalIcon,
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
  type BrowserPreviewAgentationMessage,
  type BrowserPreviewAnnotation,
  type BrowserPreviewMessage,
  isBrowserPreviewBridgeMessage,
  isBrowserPreviewMessage,
  registerBrowserPreviewTarget,
  validatePreviewUrlInput,
} from '@/features/home/data/browser-preview';

interface WebPreviewContextValue {
  canGoBack: boolean;
  canGoForward: boolean;
  currentUrl: string;
  error: string | null;
  frameUrl: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  loading: boolean;
  navigateTo: (url: string) => void;
  navigation: PreviewNavigation;
  previewName?: string;
  recordFrameNavigation: (url: string) => void;
  reloadPreview: (
    hard?: boolean,
    storageScope?: 'cache' | 'cookies' | 'all'
  ) => void;
  runHistory: (direction: 'back' | 'forward') => void;
  setError: (error: string | null) => void;
  setFrameUrl: (url: string) => void;
  setLoading: (loading: boolean) => void;
}

type HistoryEntry = {
  url: string;
};

/**
 * The last user-driven navigation (address bar, back/forward, reload). The
 * iframe binds to this — and only this — so frame-originated location changes
 * reported by the preview bridge can update history and the address bar
 * without remounting the iframe and reloading the app inside it.
 */
type PreviewNavigation = {
  id: number;
  url: string;
};

interface PreviewState {
  error: string | null;
  history: HistoryEntry[];
  historyIndex: number;
  loading: boolean;
  navigation: PreviewNavigation;
  sourceDefaultUrl?: string;
}

interface StagedAnnotation extends AnnotationPayload {
  key: string;
  sourceId?: string;
}

interface AnnotationState {
  annotations: StagedAnnotation[];
  key: string;
}

const WebPreviewContext = createContext<WebPreviewContextValue | null>(null);

type CanvasWebPreviewProps = {
  defaultUrl?: string;
  onUrlChange?: (url: string) => void;
  previewName?: string;
  projectId?: string;
  sessionId?: string;
};

export function CanvasWebPreview(props: CanvasWebPreviewProps) {
  const controller = useCanvasWebPreviewController(props);

  return (
    <WebPreviewContext value={controller.context}>
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
        <WebPreviewNavigation>
          <HistoryButton direction="back" />
          <HistoryButton direction="forward" />
          <ReloadPreviewButton />
          <WebPreviewUrl placeholder="http://localhost:3000" />
          <OpenExternalButton />
          <BrowserMenuButton />
        </WebPreviewNavigation>
        <BrowserViewport
          onAgentationMessage={controller.handleAgentationMessage}
        />
        {controller.annotations.length > 0 ||
        controller.isSendingAnnotations ? (
          <AnnotationTray
            annotations={controller.annotations}
            canSend={controller.canSendAnnotations}
            pending={controller.isSendingAnnotations}
            onClear={controller.clearAnnotations}
            onRemove={controller.removeStagedAnnotation}
            onSend={controller.sendAnnotations}
          />
        ) : null}
      </div>
    </WebPreviewContext>
  );
}

function useCanvasWebPreviewController(props: CanvasWebPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [previewState, setPreviewState] = useState(() =>
    createPreviewState(props.defaultUrl)
  );
  const [frameUrl, setFrameUrl] = useState('');
  const [annotationState, setAnnotationState] = useState<AnnotationState>({
    annotations: [],
    key: '',
  });
  const annotationKeyRef = useRef(0);
  const sendMutation = useMutation(sendAnnotationsMutationOptions());
  const activePreviewState = getActivePreviewState(
    previewState,
    props.defaultUrl
  );
  const { error, history, historyIndex, loading, navigation } =
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
  const annotationStateKey = `${props.sessionId ?? ''}:${currentUrl}`;
  const annotations =
    annotationState.key === annotationStateKey
      ? annotationState.annotations
      : [];
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  function nextAnnotationKey() {
    annotationKeyRef.current += 1;
    return `annotation-${annotationKeyRef.current}`;
  }

  function setAnnotationsForCurrentUrl(
    update:
      | StagedAnnotation[]
      | ((current: StagedAnnotation[]) => StagedAnnotation[])
  ) {
    setAnnotationState((current) => {
      const currentAnnotations =
        current.key === annotationStateKey ? current.annotations : [];
      return {
        annotations:
          typeof update === 'function' ? update(currentAnnotations) : update,
        key: annotationStateKey,
      };
    });
  }

  function navigateTo(nextUrl: string) {
    const result = validatePreviewUrlInput(nextUrl);
    if (!result.url) {
      updatePreviewState((current) => ({
        ...current,
        error: null,
        loading: false,
      }));
      if (result.error) {
        toast.error('Unsupported preview URL', {
          description: result.error,
        });
      }
      return;
    }

    updatePreviewState((current) => {
      const nextIndex = Math.max(0, current.historyIndex + 1);

      return {
        ...current,
        error: null,
        history: [...current.history.slice(0, nextIndex), { url: result.url }],
        historyIndex: nextIndex,
        loading: true,
        navigation: { id: current.navigation.id + 1, url: result.url },
      };
    });
    props.onUrlChange?.(result.url);
  }

  function runHistory(direction: 'back' | 'forward') {
    const nextIndex =
      direction === 'back'
        ? Math.max(0, historyIndex - 1)
        : Math.min(history.length - 1, historyIndex + 1);
    const nextEntry = history[nextIndex];
    if (!nextEntry || nextIndex === historyIndex) {
      return;
    }

    updatePreviewState((current) => ({
      ...current,
      error: null,
      historyIndex: nextIndex,
      loading: true,
      navigation: { id: current.navigation.id + 1, url: nextEntry.url },
    }));
    props.onUrlChange?.(nextEntry.url);
  }

  function rebindFrame() {
    updatePreviewState((current) => ({
      ...current,
      error: null,
      loading: true,
      navigation: {
        id: current.navigation.id + 1,
        url: current.history[current.historyIndex]?.url ?? '',
      },
    }));
  }

  function reloadPreview(
    hard = false,
    storageScope: 'cache' | 'cookies' | 'all' = 'all'
  ) {
    if (!currentUrl) {
      return;
    }
    if (hard) {
      // Clearing settles (ack, direct completion, or timeout) before the
      // single rebind, so the remount cannot kill storage work mid-flight
      // and clear actions never reload twice.
      void clearCurrentFrameStorage(iframeRef.current, storageScope).then(
        (result) => {
          if (!result.ok) {
            toast.error(
              result.error
                ? `Preview storage was not cleared: ${result.error}`
                : 'Preview storage was not cleared.'
            );
          }
          rebindFrame();
        }
      );
      return;
    }
    rebindFrame();
  }

  // The preview bridge reports the frame's logical location (initial load,
  // link clicks, SPA pushState/replaceState, popstate, hash changes). It is
  // the source of truth for the address bar and history; it never rebinds
  // the iframe. A change matching the adjacent history entry is the frame's
  // own back/forward, so the index moves instead of pushing a duplicate.
  function recordFrameNavigation(nextUrl: string) {
    const result = validatePreviewUrlInput(nextUrl);
    if (!result.url) {
      return;
    }

    updatePreviewState((current) => {
      const activeUrl = current.history[current.historyIndex]?.url;
      if (activeUrl === result.url) {
        return current.loading ? { ...current, loading: false } : current;
      }

      if (current.history[current.historyIndex - 1]?.url === result.url) {
        return {
          ...current,
          historyIndex: current.historyIndex - 1,
          loading: false,
        };
      }

      if (current.history[current.historyIndex + 1]?.url === result.url) {
        return {
          ...current,
          historyIndex: current.historyIndex + 1,
          loading: false,
        };
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
    if (result.url !== currentUrl) {
      props.onUrlChange?.(result.url);
    }
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
          setAnnotationsForCurrentUrl([]);
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
      setAnnotationsForCurrentUrl((current) =>
        addOrUpdateAnnotation(current, annotation)
      );
      return;
    }

    if (message.type === 'yyork:annotation-updated' && annotation) {
      setAnnotationsForCurrentUrl((current) =>
        addOrUpdateAnnotation(current, annotation)
      );
      return;
    }

    if (message.type === 'yyork:annotation-deleted' && annotation) {
      setAnnotationsForCurrentUrl((current) =>
        removeAnnotation(current, annotation)
      );
      return;
    }

    if (message.type === 'yyork:annotations-cleared') {
      setAnnotationsForCurrentUrl([]);
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
    error,
    frameUrl,
    iframeRef,
    loading,
    navigateTo,
    navigation,
    previewName: props.previewName,
    recordFrameNavigation,
    reloadPreview,
    runHistory,
    setError: setPreviewError,
    setFrameUrl,
    setLoading: setPreviewLoading,
  };

  return {
    annotations,
    canSendAnnotations: Boolean(props.sessionId),
    clearAnnotations: () => setAnnotationsForCurrentUrl([]),
    context,
    handleAgentationMessage,
    isSendingAnnotations: sendMutation.isPending,
    removeStagedAnnotation: (annotation: StagedAnnotation) =>
      setAnnotationsForCurrentUrl((current) =>
        removeAnnotation(current, annotation)
      ),
    sendAnnotations: () => sendAnnotationsToAgent(),
  };
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
  const { currentUrl, frameUrl } = useWebPreview();
  const urlToOpen = frameUrl || currentUrl;
  const disabled = !urlToOpen.trim();

  return (
    <WebPreviewNavigationButton
      tooltip="Open externally"
      className="ms-auto"
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          window.open(urlToOpen, '_blank', 'noopener,noreferrer');
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
            size="icon"
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

function BrowserViewport(props: {
  onAgentationMessage: (message: BrowserPreviewAgentationMessage) => void;
}) {
  const [frameState, setFrameState] = useState<{
    frameUrl: string;
    sourceUrl: string;
  }>({ frameUrl: '', sourceUrl: '' });
  const {
    currentUrl,
    error,
    iframeRef,
    loading,
    navigation,
    previewName,
    recordFrameNavigation,
    setError,
    setFrameUrl,
    setLoading,
  } = useWebPreview();
  const frameUrl =
    frameState.sourceUrl === navigation.url ? frameState.frameUrl : '';
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
  const handleFrameLoad = useEffectEvent(() => {
    setLoading(false);
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
        // Storage-clear acks are consumed by clearCurrentFrameStorage, which
        // owns the pending clear and surfaces failures as a toast.
        return;
      }

      if (message.type !== 'yyork:agentation-ready') {
        props.onAgentationMessage(message);
      }
    }
  );

  // Bind the iframe to user-driven navigations only. Bridge-reported
  // location changes update `currentUrl` but not `navigation`, so an SPA
  // navigating inside the preview never re-registers or remounts the frame.
  useEffect(() => {
    if (!navigation.url) {
      return;
    }

    const controller = new AbortController();

    void registerBrowserPreviewTarget(navigation.url, {
      previewName,
      signal: controller.signal,
    })
      .then((target) => {
        setFrameState({
          frameUrl: target.previewUrl,
          sourceUrl: navigation.url,
        });
        setFrameUrl(target.previewUrl);
      })
      .catch((errorValue: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        handlePreviewRegistrationError(errorValue);
      });

    return () => controller.abort();
  }, [navigation.id, navigation.url, previewName, setFrameUrl]);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame || !frameUrl) {
      return;
    }
    const activeFrame = frame;

    function handleLoad() {
      handleFrameLoad();
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
  }, [frameUrl, navigation.id, iframeRef]);

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
          key={`${navigation.id}:${frameUrl}`}
          ref={iframeRef}
          title="Browser preview"
          src={frameUrl}
          sandbox="allow-downloads allow-forms allow-modals allow-pointer-lock allow-popups allow-scripts"
          className="block size-full border-0 bg-background"
        />
      ) : currentUrl ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Preparing local preview
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
          <Globe size={40} />
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
            <div className="min-wt-0 flex-1">
              <p className="wrap-break-words">
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
              size="icon"
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
            size="icon"
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
      className="h-8 min-w-0 flex-1 rounded-md border border-input shadow-none focus-within:border-input focus-within:ring-0"
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
      error: null,
      history: [],
      historyIndex: -1,
      loading: false,
      navigation: { id: 0, url: '' },
      sourceDefaultUrl: defaultUrl,
    };
  }

  return {
    error: null,
    history: [{ url: result.url }],
    historyIndex: 0,
    loading: false,
    navigation: { id: 0, url: result.url },
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

  // Navigations report through onUrlChange, get persisted as the target's
  // preview URL, and echo back here as a new defaultUrl. When the echo
  // matches where the preview already is, adopt it without resetting state —
  // resetting would remount the iframe mid-navigation and wipe history.
  const result = validateInitialUrl(defaultUrl);
  if (result.url && result.url === current.history[current.historyIndex]?.url) {
    return { ...current, sourceDefaultUrl: defaultUrl };
  }

  return createPreviewState(defaultUrl);
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

type StorageClearScope = 'cache' | 'cookies' | 'all';

type StorageClearResult = {
  error?: string;
  ok: boolean;
};

// How long a bridge-enabled preview gets to acknowledge a storage-clear
// command before the clear is reported as failed and the reload proceeds.
const storageClearAckTimeoutMs = 2000;

async function clearCurrentFrameStorage(
  frame: HTMLIFrameElement | null,
  scope: StorageClearScope = 'all'
): Promise<StorageClearResult> {
  const win = frame?.contentWindow;
  if (!win) {
    return { error: 'The preview frame is not available.', ok: false };
  }

  // Same-origin frames (dogfood iframe access) are cleared directly.
  // Everything else is a proxied preview: the injected bridge does the
  // clearing inside the preview origin and must acknowledge it.
  if (canAccessFrameStorage(frame)) {
    return clearFrameStorageDirectly(win, scope);
  }

  return clearFrameStorageViaBridge(frame, win, scope);
}

function canAccessFrameStorage(frame: HTMLIFrameElement | null) {
  try {
    return Boolean(frame?.contentWindow?.document);
  } catch {
    return false;
  }
}

async function clearFrameStorageDirectly(
  win: Window,
  scope: StorageClearScope
): Promise<StorageClearResult> {
  try {
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
    return { ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Storage access failed.',
      ok: false,
    };
  }
}

function clearFrameStorageViaBridge(
  frame: HTMLIFrameElement,
  win: Window,
  scope: StorageClearScope
): Promise<StorageClearResult> {
  return new Promise((resolve) => {
    let timer = 0;

    function settle(result: StorageClearResult) {
      window.clearTimeout(timer);
      window.removeEventListener('message', handleAck);
      resolve(result);
    }

    function handleAck(event: MessageEvent) {
      if (event.source !== win || !isBrowserPreviewBridgeMessage(event.data)) {
        return;
      }
      const message = event.data;
      if (message.scope !== scope) {
        return;
      }
      if (message.type === 'yyork:storage-cleared') {
        settle({ ok: true });
      }
      if (message.type === 'yyork:storage-clear-failed') {
        settle({ error: message.error, ok: false });
      }
    }

    window.addEventListener('message', handleAck);
    timer = window.setTimeout(() => {
      settle({
        error: 'The preview did not confirm storage clearing.',
        ok: false,
      });
    }, storageClearAckTimeoutMs);
    postPreviewStorageCommand(frame, scope);
  });
}

function postPreviewStorageCommand(
  frame: HTMLIFrameElement | null,
  scope: StorageClearScope
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

function useWebPreview() {
  const context = use(WebPreviewContext);

  if (!context) {
    throw new Error(
      'WebPreview components must be used within CanvasWebPreview'
    );
  }

  return context;
}
