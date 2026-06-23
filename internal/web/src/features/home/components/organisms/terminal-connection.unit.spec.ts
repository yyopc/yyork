import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createDebouncedCallback,
  createTerminalWebSocketURL,
  isRetryableTerminalStatus,
} from './terminal-connection';

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
        { host: 'yyork.local', protocol: 'https:' }
      )
    ).toBe(
      'wss://yyork.local/api/sessions/session-ao-2/terminal?cols=100&project=agent-orchestrator&rows=30'
    );
  });

  it('marks only failed and disconnected terminal states as retryable', () => {
    expect(isRetryableTerminalStatus('failed')).toBe(true);
    expect(isRetryableTerminalStatus('disconnected')).toBe(true);
    expect(isRetryableTerminalStatus('connected')).toBe(false);
    expect(isRetryableTerminalStatus('unsupported')).toBe(false);
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
