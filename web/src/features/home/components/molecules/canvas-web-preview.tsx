import { useMutation } from '@tanstack/react-query';
import {
  ExternalLinkIcon,
  RefreshCcwIcon,
  SendHorizontalIcon,
  SquareMousePointerIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';
import {
  type ComponentProps,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
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

interface WebPreviewContextValue {
  reloadPreview: () => void;
  reloadVersion: number;
  setUrl: (url: string) => void;
  url: string;
}

interface StagedAnnotation extends AnnotationPayload {
  key: string;
}

const WebPreviewContext = createContext<WebPreviewContextValue | null>(null);

export function CanvasWebPreview(props: {
  defaultUrl?: string;
  onUrlChange?: (url: string) => void;
  projectId?: string;
  sessionId?: string;
}) {
  const [url, setUrl] = useState(props.defaultUrl ?? '');
  const [annotating, setAnnotating] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [annotations, setAnnotations] = useState<StagedAnnotation[]>([]);
  const annotationKeyRef = useRef(0);

  useEffect(() => {
    setUrl(props.defaultUrl ?? '');
  }, [props.defaultUrl]);

  const previewOrigin = useMemo(() => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }, [url]);

  // Staged annotations belong to one target; drop them when the target session
  // or previewed origin changes so feedback can't be sent to the wrong agent.
  useEffect(() => {
    setAnnotations([]);
  }, [props.sessionId, previewOrigin]);

  // While capture is armed, collect annotations the in-app agentation instance
  // postMessages to us. The worker app's glue posts {type:'ao:annotation'} to
  // window.parent; we only trust messages from the previewed origin.
  useEffect(() => {
    if (!annotating || !previewOrigin) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== previewOrigin) {
        return;
      }
      if (!isAnnotationMessage(event.data)) {
        return;
      }

      const payload = toAnnotationPayload(event.data.payload);
      if (!payload.comment) {
        return;
      }

      annotationKeyRef.current += 1;
      const key = `annotation-${annotationKeyRef.current}`;
      setAnnotations((current) => [...current, { ...payload, key }]);
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [annotating, previewOrigin]);

  const handleUrlChange = (nextUrl: string) => {
    setUrl(nextUrl);
    setReloadVersion((currentVersion) => currentVersion + 1);
    props.onUrlChange?.(nextUrl);
  };

  const handleReloadPreview = () => {
    setReloadVersion((currentVersion) => currentVersion + 1);
  };

  return (
    <WebPreviewContext
      value={{
        reloadPreview: handleReloadPreview,
        reloadVersion,
        setUrl: handleUrlChange,
        url,
      }}
    >
      <div className="flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
        <WebPreviewNavigation>
          <ReloadPreviewButton />
          <WebPreviewUrl placeholder="http://localhost:3000" />
          <AnnotationToggle
            pressed={annotating}
            onPressedChange={setAnnotating}
          />
          <OpenExternalButton />
        </WebPreviewNavigation>
        <WebPreviewBody
          title="Canvas browser preview"
          loadingNode={
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Enter a local preview URL
            </div>
          }
        />
        {annotating ? (
          <AnnotationTray
            annotations={annotations}
            projectId={props.projectId}
            sessionId={props.sessionId}
            onClear={() => setAnnotations([])}
            onRemove={(key) =>
              setAnnotations((current) =>
                current.filter((annotation) => annotation.key !== key)
              )
            }
            onSent={() => setAnnotations([])}
          />
        ) : null}
      </div>
    </WebPreviewContext>
  );
}

function ReloadPreviewButton() {
  const { reloadPreview, url } = useWebPreview();
  const disabled = !url.trim();

  return (
    <WebPreviewNavigationButton
      tooltip="Reload preview"
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
  const { url } = useWebPreview();
  const disabled = !url.trim();

  return (
    <WebPreviewNavigationButton
      tooltip="Open externally"
      disabled={disabled}
      onClick={() => {
        if (disabled) {
          return;
        }

        window.open(url, '_blank', 'noopener,noreferrer');
      }}
    >
      <ExternalLinkIcon aria-hidden="true" />
    </WebPreviewNavigationButton>
  );
}

function AnnotationToggle(props: {
  onPressedChange: (pressed: boolean) => void;
  pressed: boolean;
}) {
  const tooltip = props.pressed ? 'Disable annotations' : 'Enable annotations';

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Toggle
            size={props.pressed ? 'sm' : 'icon-sm'}
            className={cn(
              'ms-auto rounded-sm font-normal shadow-none',
              props.pressed &&
                'border-positive-500/60 bg-positive-500/10 text-positive-500 hover:border-positive-500/70 hover:bg-positive-500/15 hover:text-positive-500 data-pressed:border-positive-500/60 data-pressed:bg-positive-500/10 data-pressed:text-positive-500'
            )}
            pressed={props.pressed}
            aria-label={tooltip}
            onPressedChange={props.onPressedChange}
          />
        }
      >
        <SquareMousePointerIcon aria-hidden="true" data-icon="inline-start" />
        {props.pressed ? <span>annotating</span> : null}
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function AnnotationTray(props: {
  annotations: StagedAnnotation[];
  onClear: () => void;
  onRemove: (key: string) => void;
  onSent: () => void;
  projectId?: string;
  sessionId?: string;
}) {
  const sendMutation = useMutation(sendAnnotationsMutationOptions());
  const count = props.annotations.length;
  const canSend =
    Boolean(props.sessionId) && count > 0 && !sendMutation.isPending;

  const handleSend = () => {
    if (!props.sessionId || count === 0) {
      return;
    }

    sendMutation.mutate(
      {
        annotations: props.annotations.map(toAnnotationRequestPayload),
        projectId: props.projectId,
        sessionId: props.sessionId,
      },
      {
        onError: (error) => {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Failed to send annotations.'
          );
        },
        onSuccess: (result) => {
          toast.success(
            `Sent ${result.delivered} annotation${result.delivered === 1 ? '' : 's'} to the agent.`
          );
          props.onSent();
        },
      }
    );
  };

  return (
    <div className="flex max-h-[40%] min-h-0 shrink-0 flex-col border-t border-border bg-muted/20">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 text-xs">
        <span className="font-medium">
          {count === 0
            ? 'No annotations yet'
            : `${count} annotation${count === 1 ? '' : 's'} staged`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-sm"
            disabled={count === 0 || sendMutation.isPending}
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
            onClick={handleSend}
          >
            <SendHorizontalIcon aria-hidden="true" data-icon="inline-start" />
            {sendMutation.isPending ? 'Sending…' : 'Send to agent'}
          </Button>
        </div>
      </div>
      {count === 0 ? (
        <p className="px-3 pb-3 text-xs text-muted-foreground">
          {props.sessionId
            ? 'Use the agentation tool inside the preview to point at elements and add feedback.'
            : 'Select a worker session to send feedback to its agent.'}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-auto">
          {props.annotations.map((annotation) => (
            <li
              key={annotation.key}
              className="flex items-start gap-2 px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="break-words">{annotation.comment}</p>
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
                onClick={() => props.onRemove(annotation.key)}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
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
  const { setUrl, url } = useWebPreview();
  const [draftUrl, setDraftUrl] = useState(url);

  useEffect(() => {
    setDraftUrl(url);
  }, [url]);

  return (
    <Input
      {...props}
      value={draftUrl}
      className="h-8 max-w-[66.666%] min-w-0 flex-1 rounded-2xl border-0"
      autoCapitalize="none"
      autoComplete="off"
      autoCorrect="off"
      onChange={(event) => {
        setDraftUrl(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          setUrl(event.currentTarget.value);
        }

        props.onKeyDown?.(event);
      }}
    />
  );
}

function WebPreviewBody({
  className,
  loadingNode,
  ...props
}: ComponentProps<'iframe'> & { loadingNode: React.ReactNode }) {
  const { reloadVersion, url } = useWebPreview();

  return (
    <div className="min-h-0 w-full flex-1 bg-muted/20">
      {url ? (
        <iframe
          key={`${url}:${reloadVersion}`}
          sandbox="allow-forms allow-same-origin allow-scripts"
          src={url}
          className={cn(
            'size-full border-0 bg-background outline-none focus:outline-none',
            className
          )}
          {...props}
        />
      ) : (
        <div className="h-full w-full">{loadingNode}</div>
      )}
    </div>
  );
}

function useWebPreview() {
  const context = useContext(WebPreviewContext);

  if (!context) {
    throw new Error(
      'WebPreview components must be used within CanvasWebPreview'
    );
  }

  return context;
}

function isAnnotationMessage(
  data: unknown
): data is { payload: Record<string, unknown>; type: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { type?: unknown }).type === 'ao:annotation' &&
    typeof (data as { payload?: unknown }).payload === 'object' &&
    (data as { payload?: unknown }).payload !== null
  );
}

function toAnnotationPayload(
  payload: Record<string, unknown>
): AnnotationPayload {
  return {
    comment: asString(payload.comment) ?? '',
    element: asString(payload.element),
    elementPath: asString(payload.elementPath),
    id: asString(payload.id),
    intent: asString(payload.intent),
    reactComponents: asString(payload.reactComponents),
    selectedText: asString(payload.selectedText),
    severity: asString(payload.severity),
    url: asString(payload.url),
  };
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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
