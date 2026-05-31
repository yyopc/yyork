import { Terminal } from '@wterm/react';
import {
  Maximize2Icon,
  Minimize2Icon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/tailwind/utils';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { OpenIdeButton } from '@/features/home/components/molecules/open-ide-button';
import {
  applyMouseModeSequences,
  createDebouncedCallback,
  createTerminalWebSocketURL,
  type DebouncedCallback,
  encodeMouseWheel,
  initialMouseTrackingState,
  initialTerminalSize,
  isMouseTrackingEnabled,
  isRetryableTerminalStatus,
  type MouseTrackingState,
  type TerminalConnectionStatus,
} from '@/features/home/components/organisms/terminal-connection';
import {
  type TerminalHandle,
  XTermTerminal,
} from '@/features/home/components/organisms/xterm-terminal';
import type { WorkerSession } from '@/features/home/domain/session-workspace';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const escapeChar = '\x1b';
const escapeByte = 0x1b;
const terminalReconnectDelaysMs = [500, 1_000, 2_000] as const;
const terminalResetSequence = '\x1b[3J\x1b[2J\x1b[H';
const terminalStableConnectionMs = 5_000;
// Send the PTY a single resize once the pane stops animating/dragging instead
// of on every intermediate frame, so the attached program gets one SIGWINCH.
const terminalResizeDebounceMs = 100;
// Overlap kept between stream chunks so a mouse-mode sequence split across a
// websocket frame boundary is still detected.
const mouseModeScanOverlap = 8;

type TerminalSize = typeof initialTerminalSize;

export function TerminalPanel(props: {
  className?: string;
  hidden?: boolean;
  session?: WorkerSession;
}) {
  const { session } = props;
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<TerminalHandle | null>(null);
  const terminalPanelRef = useRef<HTMLElement | null>(null);
  const clearBeforeNextMessageRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const terminalSizeRef = useRef(initialTerminalSize);
  const [terminalSize, setTerminalSize] =
    useState<TerminalSize>(initialTerminalSize);
  const resizeDebouncerRef = useRef<DebouncedCallback<[number, number]> | null>(
    null
  );
  const mouseTrackingRef = useRef<MouseTrackingState>(
    initialMouseTrackingState
  );
  const mouseScanTailRef = useRef('');
  const lastConnectionToastRef = useRef<string | undefined>(undefined);
  // True once the (single, persistent) terminal instance has finished mounting.
  // The instance is reused across session switches — only the WebSocket is
  // re-pointed — so readiness is a property of the renderer, not the session.
  const [isTerminalReady, setIsTerminalReady] = useState(false);
  // The live terminal handle the wheel listener binds to. Tracked as state (not
  // just terminalRef) so the wheel effect re-subscribes if the element identity
  // ever changes (e.g. a renderer swap remounts the component). With a stable,
  // non-keyed instance it is set once and the listener stays bound for good.
  const [readyTerminal, setReadyTerminal] = useState<TerminalHandle | null>(
    null
  );
  // Reactive mirror of mouseTrackingRef's "is any tracking mode on" so the wheel
  // effect can subscribe to it. We only attach a (necessarily non-passive) wheel
  // listener while the attached program actually wants mouse reports; otherwise
  // we leave the wheel alone so the browser scrolls wterm's native scrollback on
  // its compositor fast path instead of stalling on a main-thread JS listener.
  const [mouseTrackingActive, setMouseTrackingActive] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<TerminalConnectionStatus>('idle');
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const [isTerminalFullscreen, setIsTerminalFullscreen] = useState(false);
  // Experiment toggle: render the PTY through wterm (DOM) or xterm.js (WebGL).
  // xterm is the default — it ships a real scrollback/viewport engine and feels
  // good; wterm is the rough experiment. Persisted so a reload keeps whichever
  // renderer you were comparing; only an explicit 'wterm' opt-in selects wterm.
  const [terminalBackend, setTerminalBackend] = useState<'wterm' | 'xterm'>(
    () => {
      if (typeof window === 'undefined') {
        return 'xterm';
      }

      return window.localStorage.getItem('ao-terminal-backend') === 'wterm'
        ? 'wterm'
        : 'xterm';
    }
  );

  const sendResize = useCallback((cols: number, rows: number) => {
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
  }, []);

  if (resizeDebouncerRef.current === null) {
    resizeDebouncerRef.current = createDebouncedCallback(
      (cols: number, rows: number) => sendResize(cols, rows),
      terminalResizeDebounceMs
    );
  }

  const terminalSessionKey = session
    ? `${session.project}/${session.id}`
    : 'idle';
  const sessionId = session?.id;
  const sessionProject = session?.project;
  const sessionTerminalSupported = session?.terminalSupported;
  const sessionWorkerId = session?.workerId;

  const syncTerminalSize = useCallback(
    (size: TerminalSize, options?: { forceSend?: boolean }) => {
      const previousSize = terminalSizeRef.current;
      terminalSizeRef.current = size;
      setTerminalSize((current) => {
        if (current.cols === size.cols && current.rows === size.rows) {
          return current;
        }

        return size;
      });

      const sizeChanged =
        previousSize.cols !== size.cols || previousSize.rows !== size.rows;
      if (!sizeChanged && !options?.forceSend) {
        return;
      }

      if (options?.forceSend) {
        resizeDebouncerRef.current?.cancel();
        sendResize(size.cols, size.rows);
        return;
      }

      resizeDebouncerRef.current?.schedule(size.cols, size.rows);
    },
    [sendResize]
  );

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
      setConnectionStatus('idle');
      return;
    }

    if (!sessionTerminalSupported) {
      setConnectionStatus('unsupported');
      return;
    }

    if (!terminal || !isTerminalReady) {
      setConnectionStatus('connecting');
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
        setConnectionAttempt((currentAttempt) => currentAttempt + 1);
      }, nextDelay);
    };

    mouseTrackingRef.current = initialMouseTrackingState;
    mouseScanTailRef.current = '';
    setMouseTrackingActive(false);

    const socket = new WebSocket(
      createTerminalWebSocketURL(
        { id: sessionId, project: sessionProject },
        window.location,
        terminalSize
      )
    );
    socket.binaryType = 'arraybuffer';
    socketRef.current = socket;
    setConnectionStatus('connecting');

    const updateMouseTrackingFromStream = (data: unknown) => {
      let text: string | undefined;
      if (typeof data === 'string') {
        text = data;
      } else if (data instanceof ArrayBuffer) {
        // Must copy the bytes before decoding — sharing a Uint8Array view of
        // the same ArrayBuffer that writeTerminalMessage passes to
        // terminal.write() corrupts wterm's write path.
        const copy = new Uint8Array(new Uint8Array(data));
        if (
          copy.includes(escapeByte) ||
          mouseScanTailRef.current.includes(escapeChar)
        ) {
          text = textDecoder.decode(copy);
        }
      }

      if (text === undefined) {
        mouseScanTailRef.current = '';
        return;
      }

      const combined = mouseScanTailRef.current + text;
      mouseTrackingRef.current = applyMouseModeSequences(
        combined,
        mouseTrackingRef.current
      );
      mouseScanTailRef.current = combined.slice(-mouseModeScanOverlap);
      // Drive the wheel listener on/off as the program toggles mouse reporting.
      // setState bails when the boolean is unchanged, so this is cheap per chunk.
      setMouseTrackingActive(isMouseTrackingEnabled(mouseTrackingRef.current));
    };

    socket.addEventListener('open', () => {
      if (!active) {
        return;
      }

      clearReconnectTimer();
      markTerminalConnectionStableLater();
      setConnectionStatus('connected');
      syncTerminalSize(terminalSizeRef.current, { forceSend: true });
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

      updateMouseTrackingFromStream(event.data);

      if (clearBeforeNextMessageRef.current) {
        currentTerminal.write(terminalResetSequence);
        clearBeforeNextMessageRef.current = false;
      }
      writeTerminalMessage(currentTerminal, event.data);
    });

    socket.addEventListener('error', () => {
      if (active) {
        clearStableConnectionTimer();
        setConnectionStatus('failed');
        scheduleTerminalReconnect();
      }
    });

    socket.addEventListener('close', (event) => {
      if (!active) {
        return;
      }

      if (event.wasClean) {
        clearStableConnectionTimer();
        setConnectionStatus('disconnected');
        return;
      }

      clearStableConnectionTimer();
      setConnectionStatus('failed');
      scheduleTerminalReconnect();
    });

    return () => {
      active = false;
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      resizeDebouncerRef.current?.cancel();
      clearStableConnectionTimer();
      clearReconnectTimer();
      socket.close(1000, 'terminal session changed');
    };
  }, [
    connectionAttempt,
    isTerminalReady,
    sessionId,
    sessionProject,
    sessionTerminalSupported,
    syncTerminalSize,
  ]);

  const handleTerminalReady = useCallback(
    (terminal: TerminalHandle) => {
      terminalRef.current = terminal;
      setIsTerminalReady(true);
      setReadyTerminal(terminal);

      // When swapping renderers the socket is already open, so the freshly
      // mounted (empty) terminal needs the server to repaint. Force a resize to
      // trigger SIGWINCH and clear stale glyphs before it lands.
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        clearBeforeNextMessageRef.current = true;
        syncTerminalSize(terminalSizeRef.current, { forceSend: true });
      }
    },
    [syncTerminalSize]
  );

  const handleTerminalBackendChange = useCallback((next: string) => {
    if (next !== 'wterm' && next !== 'xterm') {
      return;
    }

    try {
      window.localStorage.setItem('ao-terminal-backend', next);
    } catch {
      // Storage unavailable (private mode, etc.) — selection still applies for
      // this session, it just won't survive a reload.
    }

    setTerminalBackend(next);
  }, []);

  // Forward trackpad/wheel scroll to the PTY when the attached program has
  // requested mouse tracking (DECSET 1000/1002/1003), encoding it exactly as the
  // program negotiated (SGR when 1006 is set, else X10).
  //
  // We attach this listener ONLY while tracking is active. The listener must be
  // non-passive so it can preventDefault and forward, and a non-passive wheel
  // listener disables the browser's compositor fast-path scrolling. wterm has no
  // scroll engine of its own — it relies on native overflow scroll — so leaving
  // a non-passive listener bound while tracking is off made its scrollback feel
  // janky/stuck. When tracking is off we bind nothing and let the browser scroll
  // natively; we also never inject a sequence the program did not ask for.
  useEffect(() => {
    const terminal = readyTerminal;
    if (!terminal || !mouseTrackingActive) {
      return undefined;
    }
    const el = terminal.element;

    const onWheel = (event: WheelEvent) => {
      const state = mouseTrackingRef.current;
      if (!isMouseTrackingEnabled(state)) {
        return;
      }

      const rect = el.getBoundingClientRect();
      const styles = getComputedStyle(el);
      const paddingLeft = parseFloat(styles.paddingLeft) || 0;
      const paddingRight = parseFloat(styles.paddingRight) || 0;
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      const contentWidth = rect.width - paddingLeft - paddingRight;
      const contentHeight = rect.height - paddingTop - paddingBottom;
      const col =
        contentWidth > 0
          ? Math.min(
              terminal.cols,
              Math.floor(
                ((event.clientX - rect.left - paddingLeft) / contentWidth) *
                  terminal.cols
              ) + 1
            )
          : 1;
      const row =
        contentHeight > 0
          ? Math.min(
              terminal.rows,
              Math.floor(
                ((event.clientY - rect.top - paddingTop) / contentHeight) *
                  terminal.rows
              ) + 1
            )
          : 1;

      const sequence = encodeMouseWheel({
        col,
        deltaY: event.deltaY,
        row,
        state,
      });
      if (sequence === undefined) {
        return;
      }

      event.preventDefault();
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(textEncoder.encode(sequence));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
    // Re-runs when the program toggles mouse tracking (bind/unbind) or the ready
    // handle's element changes (renderer swap), so the listener is present only
    // while we actually forward and always sits on the live node.
  }, [readyTerminal, mouseTrackingActive]);

  const handleTerminalData = useCallback((data: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(textEncoder.encode(data));
  }, []);

  const handleTerminalResize = useCallback(
    (cols: number, rows: number) => {
      syncTerminalSize({ cols, rows });
    },
    [syncTerminalSize]
  );

  const handleTerminalError = useCallback((error: unknown) => {
    console.error('wterm failed to initialize', error);
    setConnectionStatus('failed');
  }, []);

  const handleTerminalRetry = useCallback(() => {
    clearBeforeNextMessageRef.current = true;
    reconnectAttemptRef.current = 0;
    setConnectionAttempt((currentAttempt) => currentAttempt + 1);
  }, []);

  useEffect(() => {
    if (!sessionId || !sessionWorkerId) {
      lastConnectionToastRef.current = undefined;
      return;
    }

    const toastKey = `${sessionId}:${connectionAttempt}:${connectionStatus}`;
    if (lastConnectionToastRef.current === toastKey) {
      return;
    }

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
            onClick: handleTerminalRetry,
          },
          description: `${sessionWorkerId} stopped streaming terminal output.`,
        });
        lastConnectionToastRef.current = toastKey;
        return;
      case 'failed':
        toast.error('Terminal connection failed', {
          action: {
            label: 'Reconnect',
            onClick: handleTerminalRetry,
          },
          description: `${sessionWorkerId} could not attach to the worker runtime.`,
        });
        lastConnectionToastRef.current = toastKey;
        return;
      default:
        return;
    }
  }, [
    connectionAttempt,
    connectionStatus,
    handleTerminalRetry,
    sessionId,
    sessionWorkerId,
  ]);

  const handleTerminalFullscreenToggle = useCallback(() => {
    const terminalPanel = terminalPanelRef.current;

    if (!terminalPanel) {
      return;
    }

    if (document.fullscreenElement === terminalPanel) {
      void document.exitFullscreen();
      return;
    }

    void terminalPanel.requestFullscreen();
  }, []);

  const terminalLabel = session
    ? session.kind === 'orchestrator'
      ? 'Orchestrator terminal'
      : `${session.workerId} terminal`
    : 'Worker terminal';
  const fullscreenButtonLabel = isTerminalFullscreen
    ? 'Restore terminal'
    : 'Maximize terminal';
  const canRetry = isRetryableTerminalStatus(connectionStatus);

  return (
    <section
      ref={terminalPanelRef}
      aria-label={`${terminalLabel} panel`}
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
          terminal. A keyed remount tears down the WASM instance and reloads it
          on every switch, and during that async rebuild there is no live
          element to scroll — the cause of the frozen-scroll-after-fast-switch
          bug. We keep one instance alive and re-point the WebSocket instead
          (see the connect effect + reset-on-switch above). Renderer toggles
          still remount because <Terminal> and <XTermTerminal> are different
          component types.
        */}
        {terminalBackend === 'wterm' ? (
          <Terminal
            aria-label={terminalLabel}
            autoResize
            className="ao-terminal"
            cols={terminalSize.cols}
            cursorBlink
            onResize={handleTerminalResize}
            onData={handleTerminalData}
            onError={handleTerminalError}
            onReady={handleTerminalReady}
            rows={terminalSize.rows}
            wasmUrl="/wterm.wasm"
          />
        ) : (
          <XTermTerminal
            aria-label={terminalLabel}
            className="ao-terminal"
            cols={terminalSize.cols}
            cursorBlink
            onResize={handleTerminalResize}
            onData={handleTerminalData}
            onError={handleTerminalError}
            onReady={handleTerminalReady}
            rows={terminalSize.rows}
          />
        )}
      </div>

      {/*
        z-50 lifts this control cluster above the terminal's own stacking
        layers (xterm's .xterm-helpers is z-index:5; wterm's .term-grid uses
        contain/will-change), otherwise the terminal wins the pointer hit-test
        and swallows clicks/hover on these buttons. pointer-events-none on the
        container with -auto on the controls lets clicks/selection fall through
        to the terminal everywhere except the buttons themselves.
      */}
      <div
        className={cn(
          'pointer-events-none absolute z-50 flex items-center [&_button]:pointer-events-auto',
          isTerminalFullscreen ? 'top-0 right-0' : 'top-3 right-3'
        )}
      >
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="size-9 cursor-pointer rounded-none border-r-0 shadow-none"
                      aria-label="Terminal developer settings"
                    />
                  }
                >
                  <SlidersHorizontalIcon />
                </DropdownMenuTrigger>
              }
            />
            <TooltipContent>
              <p>Terminal settings</p>
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-2xs text-muted-foreground uppercase">
                Renderer
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={terminalBackend}
                onValueChange={handleTerminalBackendChange}
              >
                <DropdownMenuRadioItem value="wterm">
                  wterm
                  <span className="ml-auto text-xs text-muted-foreground">
                    DOM
                  </span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="xterm">
                  xterm.js
                  <span className="ml-auto text-xs text-muted-foreground">
                    WebGL
                  </span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {canRetry ? (
          <IconButton
            label="Reconnect terminal"
            className="border-r-0"
            onClick={handleTerminalRetry}
          >
            <RotateCcwIcon />
          </IconButton>
        ) : null}
        <OpenIdeButton session={session} />
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
