import type { Terminal as XTerm } from '@xterm/xterm';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { WorkerSession } from '@/features/home/domain/session-workspace';
import { page, render, setupUser } from '@/tests/utils';

import { TerminalPanel } from './terminal-panel';

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
// SGR mouse reports start with ESC [ < — xterm.js emits these through onData
// once the attached program negotiates 1006 and mouse tracking is active.
// JSON resize frames are plain strings, so this only matches a forwarded
// mouse sequence.
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

// Total SGR mouse reports across all sent frames. A frame may batch several
// reports, so count occurrences of the report prefix rather than frames.
const countSgrMouseReports = (socket: FakeWebSocket | undefined) =>
  (socket?.sent ?? []).reduce<number>((count, data) => {
    if (!(data instanceof Uint8Array)) {
      return count;
    }
    return count + (decoder.decode(data).split(sgrMousePrefix).length - 1);
  }, 0);

const makeSession = (id: string): WorkerSession => ({
  agent: 'claude',
  description: 'desc',
  id,
  issue: 'issue-1',
  kind: 'worker',
  metadata: '{}',
  project: 'agent-orchestrator',
  recap: 'desc',
  state: 'working',
  terminalSupported: true,
  title: `Session ${id}`,
  workerId: `worker-${id}`,
});

const exposedTerminal = () =>
  (window as Window & { __yyorkTerminal?: XTerm }).__yyorkTerminal;

const waitForTerminal = () =>
  vi.waitFor(() => {
    const term = exposedTerminal();
    expect(term).toBeTruthy();
    return term as XTerm;
  }, 5_000);

const terminalBufferText = (term: XTerm) =>
  Array.from(
    { length: term.buffer.active.length },
    (_, index) =>
      term.buffer.active.getLine(index)?.translateToString(true) ?? ''
  ).join('\n');

const terminalReplay = (prefix: string) =>
  `${Array.from(
    { length: 80 },
    (_, index) => `${prefix}-line-${String(index + 1).padStart(2, '0')}`
  ).join('\r\n')}\r\n${prefix}$ `;

// Wait for xterm.js to parse the mouse-tracking DECSET (term.write is async)
// and bind its protocol listeners — it flags activation on its root element.
const waitForMouseTrackingScreen = () =>
  vi.waitFor(() => {
    const el = document.querySelector<HTMLElement>(
      '.xterm.enable-mouse-events .xterm-screen'
    );
    expect(el).toBeTruthy();
    return el as HTMLElement;
  }, 5_000);

const dispatchWheel = (target: HTMLElement, deltaY: number) => {
  const rect = target.getBoundingClientRect();
  target.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      deltaY,
    })
  );
};

beforeEach(() => {
  fakeSockets = [];
  realWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
});

afterEach(() => {
  globalThis.WebSocket = realWebSocket;
  document.documentElement.classList.remove('light', 'dark');
});

// Regression: trackpad scroll froze after switching sessions in the sidebar.
// The terminal was keyed by session, so every switch tore down the instance
// and rebuilt it from scratch; mid-rebuild there is no live terminal to
// scroll, and fast switches left it wedged. The fix keeps one persistent
// instance and re-points the WebSocket instead of rebuilding.
test('reuses one terminal instance across session switches instead of rebuilding it', async () => {
  const sessionA = makeSession('a');
  const sessionB = makeSession('b');

  const { rerender } = await render(<TerminalPanel session={sessionA} />);
  const element = await vi.waitFor(() => {
    const el = document.querySelector<HTMLElement>('.xterm');
    expect(el).toBeTruthy();
    return el as HTMLElement;
  }, 5_000);

  // Switch sessions a few times. A keyed remount would dispose the xterm
  // instance and create a fresh root element on every switch; the persistent
  // instance must keep the exact same node.
  await rerender(<TerminalPanel session={sessionB} />);
  await rerender(<TerminalPanel session={sessionA} />);
  await rerender(<TerminalPanel session={sessionB} />);

  expect(document.querySelectorAll('.xterm')).toHaveLength(1);
  expect(document.querySelector('.xterm')).toBe(element);
});

test('pins the terminal viewport to the bottom after switching sessions and replaying output', async () => {
  const sessionA = makeSession('a');
  const sessionB = makeSession('b');

  const { rerender } = await render(<TerminalPanel session={sessionA} />);
  const term = await waitForTerminal();

  const socketA = await vi.waitFor(() => {
    const candidate = fakeSockets.at(-1);
    expect(candidate?.url).toContain('/api/sessions/a/terminal');
    return candidate as FakeWebSocket;
  });
  socketA.fireOpen();
  const sessionAReplay = terminalReplay('session-a');
  const sessionAReplaySplit = Math.floor(sessionAReplay.length / 2);
  socketA.fireMessage(sessionAReplay.slice(0, sessionAReplaySplit));
  socketA.fireMessage(sessionAReplay.slice(sessionAReplaySplit));

  await vi.waitFor(() => {
    expect(term.buffer.active.baseY).toBeGreaterThan(0);
    expect(terminalBufferText(term)).toContain('session-a-line-80');
  }, 5_000);

  term.scrollToTop();
  await vi.waitFor(() => {
    expect(term.buffer.active.viewportY).toBe(0);
    expect(term.buffer.active.viewportY).toBeLessThan(term.buffer.active.baseY);
  }, 5_000);

  await rerender(<TerminalPanel session={sessionB} />);
  const socketB = await vi.waitFor(() => {
    const candidate = fakeSockets.at(-1);
    expect(candidate?.url).toContain('/api/sessions/b/terminal');
    return candidate as FakeWebSocket;
  });
  socketB.fireOpen();
  socketB.fireMessage(terminalReplay('session-b'));

  await vi.waitFor(() => {
    expect(term.buffer.active.baseY).toBeGreaterThan(0);
    expect(terminalBufferText(term)).toContain('session-b-line-80');
    expect(terminalBufferText(term)).not.toContain('session-a-line-80');
    expect(term.buffer.active.viewportY).toBe(term.buffer.active.baseY);
  }, 5_000);
});

test('restores a session scroll position when returning to its terminal', async () => {
  const sessionA = makeSession('a');
  const sessionB = makeSession('b');

  const { rerender } = await render(<TerminalPanel session={sessionA} />);
  const term = await waitForTerminal();
  const socketA = await vi.waitFor(() => {
    const candidate = fakeSockets.at(-1);
    expect(candidate?.url).toContain('/api/sessions/a/terminal');
    return candidate as FakeWebSocket;
  });
  socketA.fireOpen();
  const sessionAReplay = terminalReplay('session-a');
  const sessionAReplaySplit = Math.floor(sessionAReplay.length / 2);
  socketA.fireMessage(sessionAReplay.slice(0, sessionAReplaySplit));
  socketA.fireMessage(sessionAReplay.slice(sessionAReplaySplit));

  await vi.waitFor(() => {
    expect(term.buffer.active.baseY).toBeGreaterThan(0);
  }, 5_000);
  term.scrollToTop();
  const savedOffsetFromBottom = term.buffer.active.baseY;
  expect(term.buffer.active.viewportY).toBe(0);

  await rerender(<TerminalPanel session={sessionB} />);
  const socketB = await vi.waitFor(() => {
    const candidate = fakeSockets.at(-1);
    expect(candidate?.url).toContain('/api/sessions/b/terminal');
    return candidate as FakeWebSocket;
  });
  socketB.fireOpen();
  socketB.fireMessage(terminalReplay('session-b'));

  await vi.waitFor(() => {
    expect(terminalBufferText(term)).toContain('session-b-line-80');
    expect(term.buffer.active.viewportY).toBe(term.buffer.active.baseY);
  }, 5_000);

  await rerender(<TerminalPanel session={sessionA} />);
  const reconnectedSocketA = await vi.waitFor(() => {
    const candidate = fakeSockets.at(-1);
    expect(candidate).not.toBe(socketB);
    expect(candidate?.url).toContain('/api/sessions/a/terminal');
    return candidate as FakeWebSocket;
  });
  reconnectedSocketA.fireOpen();
  reconnectedSocketA.fireMessage(sessionAReplay.slice(0, sessionAReplaySplit));
  reconnectedSocketA.fireMessage(sessionAReplay.slice(sessionAReplaySplit));

  await vi.waitFor(() => {
    const restoredOffsetFromBottom =
      term.buffer.active.baseY - term.buffer.active.viewportY;
    expect(terminalBufferText(term)).toContain('session-a-line-80');
    expect(restoredOffsetFromBottom).toBe(
      Math.min(savedOffsetFromBottom, term.buffer.active.baseY)
    );
  }, 5_000);
});

test('shows the detached-window control only for docked terminals', async () => {
  const user = setupUser();
  const session = makeSession('detached-control');
  const onAttachDetached = vi.fn();
  const onOpenDetached = vi.fn();

  const { rerender } = await render(
    <TerminalPanel session={session} onOpenDetached={onOpenDetached} />
  );

  const openDetachedButton = page.getByRole('button', {
    name: 'Detach terminal',
  });
  await expect.element(openDetachedButton).toBeVisible();
  await user.click(openDetachedButton);
  expect(onOpenDetached).toHaveBeenCalledOnce();

  await rerender(
    <TerminalPanel
      detached
      session={session}
      onAttachDetached={onAttachDetached}
      onOpenDetached={onOpenDetached}
    />
  );

  expect(
    page.getByRole('button', { name: 'Detach terminal' }).query()
  ).toBeNull();

  const attachButton = page.getByRole('button', {
    name: 'Attach terminal',
  });
  await expect.element(attachButton).toBeVisible();
  await user.click(attachButton);
  expect(onAttachDetached).toHaveBeenCalledOnce();
});

test('uses the terminal background for floating terminal controls', async () => {
  const session = makeSession('terminal-background-controls');
  const onOpenDetached = vi.fn();

  await render(
    <TerminalPanel session={session} onOpenDetached={onOpenDetached} />
  );

  const controls = await vi.waitFor(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'section[aria-label$="terminal panel"] div.pointer-events-none button'
      )
    );
    expect(elements).toHaveLength(2);
    return elements;
  }, 5_000);

  const terminal = document.querySelector<HTMLElement>('.ao-terminal');
  expect(terminal).toBeTruthy();

  for (const themeClass of ['light', 'dark'] as const) {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(themeClass);

    const probe = document.createElement('span');
    probe.style.backgroundColor = 'var(--terminal-background)';
    terminal!.appendChild(probe);
    const terminalBackground = getComputedStyle(probe).backgroundColor;
    terminal!.removeChild(probe);

    for (const control of controls) {
      const clone = control.cloneNode(false) as HTMLButtonElement;
      clone.style.position = 'fixed';
      clone.style.inset = '-100px auto auto -100px';
      document.body.appendChild(clone);

      const style = getComputedStyle(clone);
      expect(style.backgroundColor).toBe(terminalBackground);
      expect(style.borderTopLeftRadius).toBe('0px');
      expect(style.borderTopRightRadius).toBe('0px');
      expect(style.borderBottomLeftRadius).toBe('0px');
      expect(style.borderBottomRightRadius).toBe('0px');

      clone.remove();
    }
  }
});

// The persistent instance must forward input to whatever socket the panel is
// now pointed at: after a switch, xterm's mouse reports (sent via onData) have
// to land on the NEW session's socket.
test('keeps forwarding wheel reports to the re-pointed socket after a session switch', async () => {
  const sessionA = makeSession('a');
  const sessionB = makeSession('b');

  const { rerender } = await render(<TerminalPanel session={sessionA} />);
  await vi.waitFor(() => {
    expect(fakeSockets.length).toBeGreaterThan(0);
  });

  // Switch to B: same terminal instance, the WebSocket is re-pointed.
  await rerender(<TerminalPanel session={sessionB} />);
  const socketB = await vi.waitFor(() => {
    const candidate = fakeSockets.at(-1);
    expect(candidate?.url).toContain('/api/sessions/b/terminal');
    return candidate as FakeWebSocket;
  });

  // Bring the new socket up and let the program negotiate mouse tracking.
  socketB.fireOpen();
  socketB.fireMessage(enableSgrMouseTracking);
  await rerender(<TerminalPanel session={sessionB} />);

  const screen = await waitForMouseTrackingScreen();
  await vi.waitFor(() => {
    dispatchWheel(screen, 120);
    expect(sentSgrMouseReport(socketB)).toBe(true);
  }, 5_000);
});

// Regression: every wheel event was reported TWICE. While mouse tracking is
// active xterm.js binds its own wheel listener and forwards correctly
// accumulated SGR reports through onData → the socket; the panel used to bind
// a second, one-report-per-DOM-event listener on the same element (it existed
// for the long-gone wterm renderer, which had no mouse-protocol engine). One
// trackpad flick became hundreds of reports. In alternate-screen agent TUIs,
// forwarded wheel or arrow input can become prompt-history jumps instead of
// browser-terminal scrolling. Nothing besides xterm itself may forward wheel
// events.
test('does not double-forward wheel events while mouse tracking is active', async () => {
  const session = makeSession('xterm');
  const { rerender } = await render(<TerminalPanel session={session} />);

  const socket = await vi.waitFor(() => {
    const candidate = fakeSockets.at(-1);
    expect(candidate).toBeDefined();
    return candidate as FakeWebSocket;
  });
  socket.fireOpen();
  socket.fireMessage(enableSgrMouseTracking);
  await rerender(<TerminalPanel session={session} />);

  const screen = await waitForMouseTrackingScreen();

  // Warm up until xterm's renderer has cell metrics and reports start flowing
  // (a full 120px notch always crosses at least one line once metrics exist).
  await vi.waitFor(() => {
    dispatchWheel(screen, 120);
    expect(countSgrMouseReports(socket)).toBeGreaterThan(0);
  }, 5_000);

  // Discrete notches give a deterministic signature: xterm.js sends exactly
  // ONE report per wheel event that crosses ≥1 line (report count is
  // independent of cell height). Any second forwarder on the same element —
  // per-event (+1 each) or accumulated (120px ≈ +7 lines each) — inflates
  // the count.
  const baseline = countSgrMouseReports(socket);
  for (let i = 0; i < 5; i++) {
    dispatchWheel(screen, 120);
  }
  expect(countSgrMouseReports(socket) - baseline).toBe(5);
});
