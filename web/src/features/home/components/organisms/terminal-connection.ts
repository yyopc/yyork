import type { WorkerSession } from '@/features/home/domain/session-workspace';

export const initialTerminalSize = {
  cols: 100,
  rows: 30,
};

export type TerminalConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'unsupported';

export interface TerminalLocation {
  host: string;
  protocol: string;
}

export function createTerminalWebSocketURL(
  session: Pick<WorkerSession, 'id' | 'project'>,
  location: TerminalLocation,
  size = initialTerminalSize
) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = new URL(
    `/api/sessions/${encodeURIComponent(session.id)}/terminal`,
    `${protocol}//${location.host}`
  );

  url.searchParams.set('cols', String(size.cols));
  url.searchParams.set('project', session.project);
  url.searchParams.set('rows', String(size.rows));

  return url.toString();
}

export function isRetryableTerminalStatus(status: TerminalConnectionStatus) {
  return status === 'disconnected' || status === 'failed';
}

const escape = String.fromCharCode(27);
// Built from String.fromCharCode to keep a raw control byte out of the source
// (and out of the no-control-regex lint path) while still matching ESC.
const decPrivateModePattern = new RegExp(`${escape}\\[\\?([0-9;]+)([hl])`, 'g');

export interface MouseTrackingState {
  any: boolean;
  button: boolean;
  sgr: boolean;
  x10: boolean;
}

export const initialMouseTrackingState: MouseTrackingState = {
  any: false,
  button: false,
  sgr: false,
  x10: false,
};

export function isMouseTrackingEnabled(state: MouseTrackingState): boolean {
  return state.x10 || state.button || state.any;
}

// Track which mouse-reporting modes the attached program has requested by
// scanning its output stream for DECSET (`h`) / DECRST (`l`) on private modes
// 1000/1002/1003 (tracking) and 1006 (SGR encoding). Re-applying the same
// sequence is idempotent, so a caller may safely prepend an overlapping tail
// from the previous chunk to catch sequences split across stream boundaries.
export function applyMouseModeSequences(
  data: string,
  state: MouseTrackingState
): MouseTrackingState {
  let { any, button, sgr, x10 } = state;

  for (const match of data.matchAll(decPrivateModePattern)) {
    const params = match[1];
    if (params === undefined) {
      continue;
    }
    const enable = match[2] === 'h';
    for (const param of params.split(';')) {
      switch (param) {
        case '1000':
          x10 = enable;
          break;
        case '1002':
          button = enable;
          break;
        case '1003':
          any = enable;
          break;
        case '1006':
          sgr = enable;
          break;
        default:
          break;
      }
    }
  }

  if (
    any === state.any &&
    button === state.button &&
    sgr === state.sgr &&
    x10 === state.x10
  ) {
    return state;
  }

  return { any, button, sgr, x10 };
}

// Encode one wheel notch as the mouse report the attached program negotiated.
// Returns undefined when no mouse tracking is active so the caller can fall
// back to native scrollback instead of injecting a sequence the program never
// asked for.
export function encodeMouseWheel(options: {
  col: number;
  deltaY: number;
  row: number;
  state: MouseTrackingState;
}): string | undefined {
  const { col, deltaY, row, state } = options;
  if (deltaY === 0 || !isMouseTrackingEnabled(state)) {
    return undefined;
  }

  // Wheel button codes: 64 = scroll up, 65 = scroll down.
  const button = deltaY < 0 ? 64 : 65;
  const safeCol = Math.max(1, col);
  const safeRow = Math.max(1, row);

  if (state.sgr) {
    return `${escape}[<${button};${safeCol};${safeRow}M`;
  }

  // Legacy X10 encoding: ESC [ M, then button/column/row each offset by 32 as
  // a single byte. Coordinates beyond 223 are unrepresentable, so clamp them.
  const encodedButton = String.fromCharCode(button + 32);
  const encodedCol = String.fromCharCode(Math.min(safeCol, 223) + 32);
  const encodedRow = String.fromCharCode(Math.min(safeRow, 223) + 32);
  return `${escape}[M${encodedButton}${encodedCol}${encodedRow}`;
}

export interface DebouncedCallback<Args extends unknown[]> {
  cancel: () => void;
  schedule: (...args: Args) => void;
}

// Trailing debounce: only the final call within a quiet window of delayMs
// actually runs. Used to collapse a burst of intermediate terminal sizes
// (emitted while a pane animates open or is dragged) into a single PTY resize,
// so the attached program receives one SIGWINCH instead of dozens.
export function createDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number
): DebouncedCallback<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: Args | undefined;

  return {
    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      pendingArgs = undefined;
    },
    schedule(...args: Args) {
      pendingArgs = args;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        const finalArgs = pendingArgs;
        pendingArgs = undefined;
        if (finalArgs) {
          callback(...finalArgs);
        }
      }, delayMs);
    },
  };
}
