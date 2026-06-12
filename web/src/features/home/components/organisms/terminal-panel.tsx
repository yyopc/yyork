import { Maximize2Icon, Minimize2Icon, RotateCcwIcon } from 'lucide-react';
import {
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { OpenIdeButton } from '@/features/home/components/molecules/open-ide-button';
import {
  createTerminalWebSocketURL,
  initialTerminalSize,
  isRetryableTerminalStatus,
  type TerminalConnectionStatus,
} from '@/features/home/components/organisms/terminal-connection';
import {
  type TerminalHandle,
  XTermTerminal,
} from '@/features/home/components/organisms/xterm-terminal';
import type { WorkerSession } from '@/features/home/domain/session-workspace';

const textEncoder = new TextEncoder();
const terminalReconnectDelaysMs = [500, 1_000, 2_000] as const;
const terminalResetSequence = '\x1b[3J\x1b[2J\x1b[H';
const terminalStableConnectionMs = 5_000;
// Send the PTY a single resize once the pane stops animating/dragging instead
// of on every intermediate frame, so the attached program gets one SIGWINCH.
const terminalResizeDebounceMs = 100;

type TerminalSize = typeof initialTerminalSize;

interface TerminalPanelProps {
  className?: string;
  hidden?: boolean;
  session?: WorkerSession;
}

interface TerminalPanelViewProps {
  canRetry: boolean;
  className?: string;
  hidden?: boolean;
  onTerminalData: (data: string) => void;
  onTerminalError: (error: unknown) => void;
  onTerminalReady: (terminal: TerminalHandle) => void;
  onTerminalResize: (cols: number, rows: number) => void;
  onTerminalRetry: () => void;
  session?: WorkerSession;
  terminalLabel: string;
  terminalSize: TerminalSize;
}

interface TerminalConnectionSnapshot {
  sessionKey: string;
  status: TerminalConnectionStatus;
}

interface TerminalRuntimeState {
  connectionAttempt: number;
  connectionSnapshot: TerminalConnectionSnapshot;
  isTerminalReady: boolean;
}

type TerminalRuntimeAction =
  | {
      sessionKey: string;
      status: TerminalConnectionStatus;
      type: 'connection-status';
    }
  | { type: 'terminal-ready' }
  | { sessionKey: string; type: 'retry-connection' };

function createTerminalRuntimeState(sessionKey: string): TerminalRuntimeState {
  return {
    connectionAttempt: 0,
    connectionSnapshot: {
      sessionKey,
      status: 'idle',
    },
    isTerminalReady: false,
  };
}

function terminalRuntimeReducer(
  state: TerminalRuntimeState,
  action: TerminalRuntimeAction
): TerminalRuntimeState {
  switch (action.type) {
    case 'connection-status':
      return {
        ...state,
        connectionSnapshot: {
          sessionKey: action.sessionKey,
          status: action.status,
        },
      };
    case 'terminal-ready':
      return {
        ...state,
        isTerminalReady: true,
      };
    case 'retry-connection':
      return {
        ...state,
        connectionAttempt: state.connectionAttempt + 1,
        connectionSnapshot: {
          sessionKey: action.sessionKey,
          status: 'connecting',
        },
      };
  }
}

export function TerminalPanel(props: TerminalPanelProps) {
  const terminalPanel = useTerminalPanel(props);

  return <TerminalPanelView {...terminalPanel} />;
}

function useTerminalPanel(props: TerminalPanelProps): TerminalPanelViewProps {
  const { session } = props;
  const terminalSessionKey = session
    ? `${session.project}/${session.id}`
    : 'idle';
  const sessionId = session?.id;
  const sessionProject = session?.project;
  const sessionTerminalSupported = session?.terminalSupported;
  const sessionWorkerId = session?.workerId;
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<TerminalHandle | null>(null);
  const clearBeforeNextMessageRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const resizeDebounceTimerRef = useRef<number | undefined>(undefined);
  const terminalSizeRef = useRef(initialTerminalSize);
  const [terminalSize, setTerminalSize] =
    useState<TerminalSize>(initialTerminalSize);
  const lastConnectionToastRef = useRef<string | undefined>(undefined);
  const [runtimeState, dispatchRuntime] = useReducer(
    terminalRuntimeReducer,
    terminalSessionKey,
    createTerminalRuntimeState
  );

  const connectionStatus =
    !sessionId || !sessionProject
      ? 'idle'
      : !sessionTerminalSupported
        ? 'unsupported'
        : !runtimeState.isTerminalReady
          ? 'connecting'
          : runtimeState.connectionSnapshot.sessionKey === terminalSessionKey
            ? runtimeState.connectionSnapshot.status
            : 'connecting';

  useEffect(() => {
    reconnectAttemptRef.current = 0;
    // The terminal instance is reused across sessions instead of being torn down
    // and rebuilt, so the previous session's screen + scrollback would linger.
    // Clear it now, and guard the next socket message in case the new session's
    // output is already in flight before the clear lands.
    clearBeforeNextMessageRef.current = true;
    terminalRef.current?.write(terminalResetSequence);
  }, [terminalSessionKey]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!sessionId || !sessionProject) {
      return;
    }

    if (!sessionTerminalSupported) {
      return;
    }

    if (!terminal || !runtimeState.isTerminalReady) {
      return;
    }

    const terminalSize = terminalSizeRef.current;
    let active = true;
    let reconnectTimer: number | undefined;
    let stableConnectionTimer: number | undefined;

    const clearReconnectTimer = () => {
      if (reconnectTimer === undefined) {
        return;
      }

      window.clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    };

    const clearStableConnectionTimer = () => {
      if (stableConnectionTimer === undefined) {
        return;
      }

      window.clearTimeout(stableConnectionTimer);
      stableConnectionTimer = undefined;
    };

    const markTerminalConnectionUseful = () => {
      clearStableConnectionTimer();
      reconnectAttemptRef.current = 0;
    };

    const markTerminalConnectionStableLater = () => {
      clearStableConnectionTimer();
      stableConnectionTimer = window.setTimeout(() => {
        stableConnectionTimer = undefined;
        reconnectAttemptRef.current = 0;
      }, terminalStableConnectionMs);
    };

    const scheduleTerminalReconnect = () => {
      if (reconnectTimer !== undefined) {
        return;
      }

      const nextDelay = terminalReconnectDelaysMs[reconnectAttemptRef.current];
      if (nextDelay === undefined) {
        return;
      }

      reconnectAttemptRef.current += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        clearBeforeNextMessageRef.current = true;
        dispatchRuntime({
          sessionKey: terminalSessionKey,
          type: 'retry-connection',
        });
      }, nextDelay);
    };

    const socket = new WebSocket(
      createTerminalWebSocketURL(
        { id: sessionId, project: sessionProject },
        window.location,
        terminalSize
      )
    );
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      if (!active) {
        return;
      }

      clearReconnectTimer();
      markTerminalConnectionStableLater();
      dispatchRuntime({
        sessionKey: terminalSessionKey,
        status: 'connected',
        type: 'connection-status',
      });
      syncTerminalPanelSize({
        forceSend: true,
        resizeDebounceTimerRef,
        setTerminalSize,
        size: terminalSizeRef.current,
        socketRef,
        terminalSizeRef,
      });
    });

    socket.addEventListener('message', (event) => {
      if (!active) {
        return;
      }

      markTerminalConnectionUseful();
      const currentTerminal = terminalRef.current;
      if (!currentTerminal) {
        return;
      }

      if (clearBeforeNextMessageRef.current) {
        currentTerminal.write(terminalResetSequence);
        clearBeforeNextMessageRef.current = false;
      }
      writeTerminalMessage(currentTerminal, event.data);
    });

    socket.addEventListener('error', () => {
      if (active) {
        clearStableConnectionTimer();
        dispatchRuntime({
          sessionKey: terminalSessionKey,
          status: 'failed',
          type: 'connection-status',
        });
        scheduleTerminalReconnect();
      }
    });

    socket.addEventListener('close', (event) => {
      if (!active) {
        return;
      }

      if (event.wasClean) {
        clearStableConnectionTimer();
        dispatchRuntime({
          sessionKey: terminalSessionKey,
          status: 'disconnected',
          type: 'connection-status',
        });
        return;
      }

      clearStableConnectionTimer();
      dispatchRuntime({
        sessionKey: terminalSessionKey,
        status: 'failed',
        type: 'connection-status',
      });
      scheduleTerminalReconnect();
    });

    return () => {
      active = false;
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      cancelTerminalResizeDebounce(resizeDebounceTimerRef);
      clearStableConnectionTimer();
      clearReconnectTimer();
      socket.close(1000, 'terminal session changed');
    };
  }, [
    runtimeState.connectionAttempt,
    runtimeState.isTerminalReady,
    sessionId,
    sessionProject,
    sessionTerminalSupported,
    terminalSessionKey,
  ]);

  function handleTerminalReady(terminal: TerminalHandle) {
    terminalRef.current = terminal;
    dispatchRuntime({ type: 'terminal-ready' });

    // When swapping renderers the socket is already open, so the freshly
    // mounted (empty) terminal needs the server to repaint. Force a resize to
    // trigger SIGWINCH and clear stale glyphs before it lands.
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      clearBeforeNextMessageRef.current = true;
      syncTerminalPanelSize({
        forceSend: true,
        resizeDebounceTimerRef,
        setTerminalSize,
        size: terminalSizeRef.current,
        socketRef,
        terminalSizeRef,
      });
    }
  }

  function handleTerminalData(data: string) {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(textEncoder.encode(data));
  }

  function handleTerminalResize(cols: number, rows: number) {
    syncTerminalPanelSize({
      resizeDebounceTimerRef,
      setTerminalSize,
      size: { cols, rows },
      socketRef,
      terminalSizeRef,
    });
  }

  function handleTerminalError(error: unknown) {
    console.error('terminal failed to initialize', error);
    dispatchRuntime({
      sessionKey: terminalSessionKey,
      status: 'failed',
      type: 'connection-status',
    });
  }

  function handleTerminalRetry() {
    clearBeforeNextMessageRef.current = true;
    reconnectAttemptRef.current = 0;
    dispatchRuntime({
      sessionKey: terminalSessionKey,
      type: 'retry-connection',
    });
  }

  useEffect(() => {
    if (!sessionId || !sessionWorkerId) {
      lastConnectionToastRef.current = undefined;
      return;
    }

    const toastKey = `${sessionId}:${runtimeState.connectionAttempt}:${connectionStatus}`;
    if (lastConnectionToastRef.current === toastKey) {
      return;
    }
    const reconnectTerminal = () => {
      clearBeforeNextMessageRef.current = true;
      reconnectAttemptRef.current = 0;
      dispatchRuntime({
        sessionKey: terminalSessionKey,
        type: 'retry-connection',
      });
    };

    switch (connectionStatus) {
      case 'unsupported':
        toast.warning('Terminal unavailable', {
          description: `${sessionWorkerId} does not expose an attachable runtime.`,
        });
        lastConnectionToastRef.current = toastKey;
        return;
      case 'disconnected':
        toast.warning('Terminal disconnected', {
          action: {
            label: 'Reconnect',
            onClick: reconnectTerminal,
          },
          description: `${sessionWorkerId} stopped streaming terminal output.`,
        });
        lastConnectionToastRef.current = toastKey;
        return;
      case 'failed':
        toast.error('Terminal connection failed', {
          action: {
            label: 'Reconnect',
            onClick: reconnectTerminal,
          },
          description: `${sessionWorkerId} could not attach to the worker runtime.`,
        });
        lastConnectionToastRef.current = toastKey;
        return;
      default:
        return;
    }
  }, [
    runtimeState.connectionAttempt,
    connectionStatus,
    sessionId,
    sessionWorkerId,
    terminalSessionKey,
  ]);

  const terminalLabel = session
    ? session.kind === 'orchestrator'
      ? 'Orchestrator terminal'
      : `${session.workerId} terminal`
    : 'Worker terminal';
  const canRetry = isRetryableTerminalStatus(connectionStatus);

  return {
    canRetry,
    className: props.className,
    hidden: props.hidden,
    onTerminalData: handleTerminalData,
    onTerminalError: handleTerminalError,
    onTerminalReady: handleTerminalReady,
    onTerminalResize: handleTerminalResize,
    onTerminalRetry: handleTerminalRetry,
    session,
    terminalLabel,
    terminalSize,
  };
}

function TerminalPanelView(props: TerminalPanelViewProps) {
  const terminalPanelRef = useRef<HTMLElement | null>(null);
  const [isTerminalFullscreen, setIsTerminalFullscreen] = useState(false);
  const fullscreenButtonLabel = isTerminalFullscreen
    ? 'Restore terminal'
    : 'Maximize terminal';

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsTerminalFullscreen(
        document.fullscreenElement === terminalPanelRef.current
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  function handleTerminalFullscreenToggle() {
    const terminalPanel = terminalPanelRef.current;

    if (!terminalPanel) {
      return;
    }

    if (document.fullscreenElement === terminalPanel) {
      void document.exitFullscreen();
      return;
    }

    void terminalPanel.requestFullscreen();
  }

  return (
    <section
      ref={terminalPanelRef}
      aria-label={`${props.terminalLabel} panel`}
      aria-hidden={props.hidden ? true : undefined}
      hidden={props.hidden}
      className={cn(
        'relative flex min-h-90 min-w-0 flex-1 flex-col border-b border-border bg-background md:min-h-0 md:border-b-0',
        isTerminalFullscreen && 'h-dvh w-dvw border-b-0',
        props.className
      )}
    >
      <div
        className={cn(
          'min-h-0 flex-1 bg-background p-3',
          isTerminalFullscreen && 'p-0'
        )}
      >
        {/*
          No key here on purpose: switching sessions must NOT remount the
          terminal. A keyed remount tears down the xterm instance (renderer,
          addons, grid) on every switch and leaves no live terminal while the
          rebuild settles — the cause of the frozen-scroll-after-fast-switch
          bug. We keep one instance alive and re-point the WebSocket instead
          (see the connect effect + reset-on-switch above).
        */}
        <XTermTerminal
          aria-label={props.terminalLabel}
          className="ao-terminal"
          cols={props.terminalSize.cols}
          cursorBlink
          onResize={props.onTerminalResize}
          onData={props.onTerminalData}
          onError={props.onTerminalError}
          onReady={props.onTerminalReady}
          rows={props.terminalSize.rows}
        />
      </div>

      {/*
        z-50 lifts this control cluster above the terminal's own stacking
        layers (xterm's .xterm-helpers is z-index:5), otherwise the terminal
        wins the pointer hit-test and swallows clicks/hover on these buttons.
        pointer-events-none on the container with -auto on the controls lets
        clicks/selection fall through to the terminal everywhere except the
        buttons themselves.
      */}
      <div
        className={cn(
          'pointer-events-none absolute z-50 flex items-center [&_button]:pointer-events-auto',
          isTerminalFullscreen ? 'top-0 right-0' : 'top-3 right-3'
        )}
      >
        {props.canRetry ? (
          <IconButton
            label="Reconnect terminal"
            className="border-r-0"
            onClick={props.onTerminalRetry}
          >
            <RotateCcwIcon />
          </IconButton>
        ) : null}
        <OpenIdeButton session={props.session} />
        <IconButton
          label={fullscreenButtonLabel}
          onClick={handleTerminalFullscreenToggle}
        >
          {isTerminalFullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
        </IconButton>
      </div>
    </section>
  );
}

function IconButton(props: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className={cn('size-9 rounded-none shadow-none', props.className)}
            aria-label={props.label}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent>
        <p>{props.label}</p>
      </TooltipContent>
    </Tooltip>
  );
}

function sendTerminalResize(
  socketRef: RefObject<WebSocket | null>,
  cols: number,
  rows: number
) {
  const socket = socketRef.current;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(
    JSON.stringify({
      cols,
      rows,
      type: 'resize',
    })
  );
}

function cancelTerminalResizeDebounce(
  resizeDebounceTimerRef: RefObject<number | undefined>
) {
  if (resizeDebounceTimerRef.current === undefined) {
    return;
  }

  window.clearTimeout(resizeDebounceTimerRef.current);
  resizeDebounceTimerRef.current = undefined;
}

function scheduleTerminalResize(params: {
  cols: number;
  resizeDebounceTimerRef: RefObject<number | undefined>;
  rows: number;
  socketRef: RefObject<WebSocket | null>;
}) {
  cancelTerminalResizeDebounce(params.resizeDebounceTimerRef);
  params.resizeDebounceTimerRef.current = window.setTimeout(() => {
    params.resizeDebounceTimerRef.current = undefined;
    sendTerminalResize(params.socketRef, params.cols, params.rows);
  }, terminalResizeDebounceMs);
}

function syncTerminalPanelSize(params: {
  forceSend?: boolean;
  resizeDebounceTimerRef: RefObject<number | undefined>;
  setTerminalSize: Dispatch<SetStateAction<TerminalSize>>;
  size: TerminalSize;
  socketRef: RefObject<WebSocket | null>;
  terminalSizeRef: RefObject<TerminalSize>;
}) {
  const previousSize = params.terminalSizeRef.current;
  params.terminalSizeRef.current = params.size;
  params.setTerminalSize((current) => {
    if (
      current.cols === params.size.cols &&
      current.rows === params.size.rows
    ) {
      return current;
    }

    return params.size;
  });

  const sizeChanged =
    previousSize.cols !== params.size.cols ||
    previousSize.rows !== params.size.rows;
  if (!sizeChanged && !params.forceSend) {
    return;
  }

  if (params.forceSend) {
    cancelTerminalResizeDebounce(params.resizeDebounceTimerRef);
    sendTerminalResize(params.socketRef, params.size.cols, params.size.rows);
    return;
  }

  scheduleTerminalResize({
    cols: params.size.cols,
    resizeDebounceTimerRef: params.resizeDebounceTimerRef,
    rows: params.size.rows,
    socketRef: params.socketRef,
  });
}

function writeTerminalMessage(terminal: TerminalHandle, data: unknown) {
  if (typeof data === 'string') {
    terminal.write(data);
    return;
  }

  if (data instanceof ArrayBuffer) {
    terminal.write(new Uint8Array(data));
    return;
  }

  if (data instanceof Blob) {
    void data.arrayBuffer().then((buffer) => {
      terminal.write(new Uint8Array(buffer));
    });
  }
}
