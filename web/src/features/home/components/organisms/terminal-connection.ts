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
