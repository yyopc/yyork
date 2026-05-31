import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyMouseModeSequences,
  createDebouncedCallback,
  createTerminalWebSocketURL,
  encodeMouseWheel,
  initialMouseTrackingState,
  isMouseTrackingEnabled,
  isRetryableTerminalStatus,
} from './terminal-connection';

const ESC = String.fromCharCode(27);

describe('terminal connection helpers', () => {
  it('builds same-origin websocket urls for the selected worker session', () => {
    expect(
      createTerminalWebSocketURL(
        { id: 'session/ao 2', project: 'agent-orchestrator' },
        { host: 'localhost:3000', protocol: 'http:' },
        { cols: 120, rows: 40 }
      )
    ).toBe(
      'ws://localhost:3000/api/sessions/session%2Fao%202/terminal?cols=120&project=agent-orchestrator&rows=40'
    );
  });

  it('uses secure websockets for https origins', () => {
    expect(
      createTerminalWebSocketURL(
        { id: 'session-ao-2', project: 'agent-orchestrator' },
        { host: 'better-ao.local', protocol: 'https:' }
      )
    ).toBe(
      'wss://better-ao.local/api/sessions/session-ao-2/terminal?cols=100&project=agent-orchestrator&rows=30'
    );
  });

  it('marks only failed and disconnected terminal states as retryable', () => {
    expect(isRetryableTerminalStatus('failed')).toBe(true);
    expect(isRetryableTerminalStatus('disconnected')).toBe(true);
    expect(isRetryableTerminalStatus('connected')).toBe(false);
    expect(isRetryableTerminalStatus('unsupported')).toBe(false);
  });
});

describe('mouse tracking state', () => {
  it('enables tracking when the program requests button/any/x10 modes', () => {
    expect(isMouseTrackingEnabled(initialMouseTrackingState)).toBe(false);

    const afterButton = applyMouseModeSequences(
      `${ESC}[?1002h`,
      initialMouseTrackingState
    );
    expect(isMouseTrackingEnabled(afterButton)).toBe(true);
    expect(afterButton.sgr).toBe(false);
  });

  it('parses combined DECSET parameters and SGR mode together', () => {
    const state = applyMouseModeSequences(
      `${ESC}[?1002;1006h`,
      initialMouseTrackingState
    );
    expect(isMouseTrackingEnabled(state)).toBe(true);
    expect(state.sgr).toBe(true);
  });

  it('disables only the matching mode on DECRST', () => {
    const enabled = applyMouseModeSequences(
      `${ESC}[?1002h${ESC}[?1006h`,
      initialMouseTrackingState
    );
    const afterDisableTracking = applyMouseModeSequences(
      `${ESC}[?1002l`,
      enabled
    );
    expect(isMouseTrackingEnabled(afterDisableTracking)).toBe(false);
    expect(afterDisableTracking.sgr).toBe(true);
  });

  it('returns the same reference when nothing relevant changed', () => {
    const state = applyMouseModeSequences(
      `plain output ${ESC}[2J no mode change`,
      initialMouseTrackingState
    );
    expect(state).toBe(initialMouseTrackingState);
  });

  it('re-applies an overlapping tail idempotently', () => {
    const first = applyMouseModeSequences(
      `${ESC}[?1002;1006h`,
      initialMouseTrackingState
    );
    const reapplied = applyMouseModeSequences(`${ESC}[?1002;1006h`, first);
    expect(reapplied.sgr).toBe(true);
    expect(isMouseTrackingEnabled(reapplied)).toBe(true);
  });
});

describe('encodeMouseWheel', () => {
  const sgrState = applyMouseModeSequences(
    `${ESC}[?1000;1006h`,
    initialMouseTrackingState
  );
  const x10State = applyMouseModeSequences(
    `${ESC}[?1000h`,
    initialMouseTrackingState
  );

  it('returns undefined when mouse tracking is off so native scroll wins', () => {
    expect(
      encodeMouseWheel({
        col: 5,
        deltaY: -1,
        row: 5,
        state: initialMouseTrackingState,
      })
    ).toBeUndefined();
  });

  it('encodes wheel up/down as valid SGR reports', () => {
    expect(
      encodeMouseWheel({ col: 12, deltaY: -1, row: 7, state: sgrState })
    ).toBe(`${ESC}[<64;12;7M`);
    expect(
      encodeMouseWheel({ col: 12, deltaY: 1, row: 7, state: sgrState })
    ).toBe(`${ESC}[<65;12;7M`);
  });

  it('falls back to X10 byte encoding when SGR is not negotiated', () => {
    expect(
      encodeMouseWheel({ col: 1, deltaY: -1, row: 1, state: x10State })
    ).toBe(
      `${ESC}[M${String.fromCharCode(96)}${String.fromCharCode(33)}${String.fromCharCode(33)}`
    );
  });

  it('clamps X10 coordinates to the single-byte range', () => {
    const encoded = encodeMouseWheel({
      col: 500,
      deltaY: 1,
      row: 500,
      state: x10State,
    });
    expect(encoded).toBe(
      `${ESC}[M${String.fromCharCode(97)}${String.fromCharCode(255)}${String.fromCharCode(255)}`
    );
  });
});

describe('createDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses a burst of calls into one trailing invocation', () => {
    const calls: Array<[number, number]> = [];
    const debounced = createDebouncedCallback<[number, number]>(
      (cols, rows) => calls.push([cols, rows]),
      100
    );

    debounced.schedule(80, 24);
    debounced.schedule(90, 24);
    debounced.schedule(100, 30);
    vi.advanceTimersByTime(50);
    expect(calls).toEqual([]);

    vi.advanceTimersByTime(60);
    expect(calls).toEqual([[100, 30]]);
  });

  it('cancel prevents a pending invocation', () => {
    const calls: number[] = [];
    const debounced = createDebouncedCallback<[number]>(
      (value) => calls.push(value),
      100
    );

    debounced.schedule(1);
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(calls).toEqual([]);
  });
});
