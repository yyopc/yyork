import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { WorkerSession } from '@/features/home/domain/session-workspace';
import { page, render, setupUser } from '@/tests/utils';

import { TerminalPanel } from './terminal-panel';
import type { TerminalHandle } from './xterm-terminal';

// One entry per <Terminal> instance React mounts. The panel keeps a single
// persistent instance across session switches, so this normally stays length 1;
// it grows only on a real remount (e.g. a renderer swap). The latest entry is
// always the live element.
type FakeTerminalMount = {
  element: HTMLElement;
  fireReady: () => void;
};

const { mockTerminalMounts } = vi.hoisted(() => ({
  mockTerminalMounts: [] as FakeTerminalMount[],
}));

// Replace the WASM-backed wterm <Terminal> with a bare div whose onReady we fire
// on demand. Deferring onReady is the whole point: it reproduces switching
// faster than the terminal can finish loading.
vi.mock('@wterm/react', async () => {
  const React = await import('react');
  const Terminal = (props: { onReady?: (handle: TerminalHandle) => void }) => {
    const ref = React.useRef<HTMLDivElement>(null);
    // Read onReady through a ref so the mount-once effect needs no deps (mirrors
    // the real XTermTerminal's callbacksRef pattern). A keyed remount creates a
    // fresh instance, so each capture holds the correct per-session onReady.
    const onReadyRef = React.useRef(props.onReady);
    onReadyRef.current = props.onReady;
    React.useEffect(() => {
      const node = ref.current;
      if (!node) {
        return;
      }
      const handle: TerminalHandle = {
        cols: 80,
        element: node,
        rows: 24,
        write: () => {},
      };
      mockTerminalMounts.push({
        element: node,
        fireReady: () => onReadyRef.current?.(handle),
      });
    }, []);
    return React.createElement('div', {
      ref,
      style: { height: '100px', width: '200px' },
    });
  };
  return { Terminal };
});

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  binaryType = 'blob';
  sent: unknown[] = [];
  private listeners: Record<string, Set<(event: unknown) => void>> = {};

  constructor(public url: string) {
    fakeSockets.push(this);
  }

  addEventListener(type: string, cb: (event: unknown) => void) {
    (this.listeners[type] ??= new Set()).add(cb);
  }

  removeEventListener(type: string, cb: (event: unknown) => void) {
    this.listeners[type]?.delete(cb);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', { wasClean: true });
  }

  private emit(type: string, extra: Record<string, unknown> = {}) {
    for (const cb of this.listeners[type] ?? []) {
      cb({ type, ...extra });
    }
  }

  fireOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  fireMessage(data: unknown) {
    this.emit('message', { data });
  }
}

let fakeSockets: FakeWebSocket[] = [];
let realWebSocket: typeof WebSocket;

const decoder = new TextDecoder();
// SGR mouse reports start with ESC [ < — encodeMouseWheel emits these once the
// program negotiates 1006. JSON resize frames are plain strings, so this only
// matches a wheel-forwarded mouse sequence.
const sgrMousePrefix = `${String.fromCharCode(27)}[<`;
const enableSgrMouseTracking = `${String.fromCharCode(27)}[?1000;1006h`;

const sentSgrMouseReport = (socket: FakeWebSocket | undefined) =>
  Boolean(
    socket?.sent.some(
      (data) =>
        data instanceof Uint8Array &&
        decoder.decode(data).startsWith(sgrMousePrefix)
    )
  );

const makeSession = (id: string): WorkerSession => ({
  agent: 'claude',
  description: 'desc',
  id,
  issue: 'issue-1',
  kind: 'worker',
  metadata: '{}',
  project: 'agent-orchestrator',
  state: 'working',
  terminalSupported: true,
  title: `Session ${id}`,
  workerId: `worker-${id}`,
});

beforeEach(() => {
  mockTerminalMounts.length = 0;
  fakeSockets = [];
  realWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  // These tests exercise the wterm renderer (mocked above); the panel now
  // defaults to xterm, so opt into wterm explicitly.
  window.localStorage.setItem('ao-terminal-backend', 'wterm');
});

afterEach(() => {
  globalThis.WebSocket = realWebSocket;
});

// Regression: trackpad scroll froze after switching sessions in the sidebar.
// The terminal was keyed by session, so every switch tore down the WASM
// instance and rebuilt it from scratch; mid-rebuild there is no live element to
// scroll, and fast switches left it wedged. The fix keeps one persistent
// instance and re-points the socket instead of rebuilding.
test('reuses one terminal instance across session switches instead of rebuilding it', async () => {
  const sessionA = makeSession('a');
  const sessionB = makeSession('b');

  const { rerender } = await render(<TerminalPanel session={sessionA} />);

  // The terminal mounts once and reports ready. (A no-op rerender flushes the
  // pending state + passive effects under the library's act().)
  mockTerminalMounts.at(-1)?.fireReady();
  await rerender(<TerminalPanel session={sessionA} />);
  expect(mockTerminalMounts).toHaveLength(1);

  // Switch sessions a few times. A keyed remount would have created a fresh
  // instance (reloading the WASM core) on every switch; the persistent instance
  // must stay a single mount.
  await rerender(<TerminalPanel session={sessionB} />);
  await rerender(<TerminalPanel session={sessionA} />);
  await rerender(<TerminalPanel session={sessionB} />);
  expect(mockTerminalMounts).toHaveLength(1);
});

// The same persistent element must keep its wheel listener after a switch, so
// scroll still forwards to whatever socket the panel is now pointed at.
test('keeps forwarding wheel scroll to the re-pointed socket after a session switch', async () => {
  const sessionA = makeSession('a');
  const sessionB = makeSession('b');

  const { rerender } = await render(<TerminalPanel session={sessionA} />);
  mockTerminalMounts.at(-1)?.fireReady();
  await rerender(<TerminalPanel session={sessionA} />);

  // Switch to B: same instance, the WebSocket is re-pointed at the new session.
  await rerender(<TerminalPanel session={sessionB} />);

  // Bring the new socket up and let the program negotiate mouse tracking.
  const socketB = fakeSockets.at(-1);
  expect(socketB).toBeDefined();
  socketB?.fireOpen();
  socketB?.fireMessage(enableSgrMouseTracking);
  await rerender(<TerminalPanel session={sessionB} />);

  // The element never changed, so the wheel listener is still bound to it.
  const liveElement = mockTerminalMounts.at(-1)?.element;
  expect(liveElement).toBeDefined();
  liveElement?.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20,
      deltaY: 120,
    })
  );

  expect(sentSgrMouseReport(socketB)).toBe(true);
});

// wterm has no scroll engine — it relies on the browser's native overflow
// scroll. A non-passive wheel listener disables the browser's fast-path, so the
// panel must bind one ONLY while it actually forwards wheel events to the PTY
// (mouse tracking on). With tracking off, no listener → smooth native scroll.
test('binds the wheel listener only while mouse tracking is active', async () => {
  const sessionA = makeSession('a');

  const { rerender } = await render(<TerminalPanel session={sessionA} />);

  // Spy on the live element before it becomes ready (nothing bound yet).
  const element = mockTerminalMounts.at(-1)?.element;
  expect(element).toBeDefined();
  const addSpy = vi.spyOn(element as HTMLElement, 'addEventListener');
  const wheelBinds = () =>
    addSpy.mock.calls.filter(([type]) => type === 'wheel');

  // Ready with mouse tracking OFF: no wheel listener, so the browser owns the
  // scrollback (the fix — previously a non-passive listener was always bound).
  mockTerminalMounts.at(-1)?.fireReady();
  await rerender(<TerminalPanel session={sessionA} />);
  expect(wheelBinds()).toHaveLength(0);

  // Program negotiates mouse tracking: now bind a non-passive listener to
  // forward wheel reports to the PTY.
  const socket = fakeSockets.at(-1);
  socket?.fireOpen();
  socket?.fireMessage(enableSgrMouseTracking);
  await rerender(<TerminalPanel session={sessionA} />);

  const binds = wheelBinds();
  expect(binds).toHaveLength(1);
  expect(binds[0]?.[2]).toEqual({ passive: false });
});

// Regression: opening the renderer settings dropdown crashed the whole panel.
// The menu put a <DropdownMenuLabel> (Base UI Menu.GroupLabel) directly under
// <DropdownMenuContent> with no enclosing <DropdownMenuGroup>, so on open the
// label threw "MenuGroupRootContext is missing". React's error boundary then
// tore down the terminal panel, killing every toolbar button (settings, Open
// IDE, fullscreen). The fix wraps the label + radio group in a group.
test('opens the renderer settings menu without crashing the panel', async () => {
  const user = setupUser();
  await render(<TerminalPanel session={makeSession('settings')} />);

  await user.click(
    page.getByRole('button', { name: 'Terminal developer settings' })
  );

  // Both renderer options render — opening would have thrown before the fix.
  await expect
    .element(page.getByRole('menuitemradio', { name: /wterm/ }))
    .toBeVisible();
  await expect
    .element(page.getByRole('menuitemradio', { name: /xterm/ }))
    .toBeVisible();

  // The panel survives: the other toolbar buttons are still mounted (they would
  // be gone if the error boundary had unmounted the subtree).
  await expect
    .element(page.getByRole('button', { name: 'Maximize terminal' }))
    .toBeVisible();
});
