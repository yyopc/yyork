import type { Terminal as XTerm } from '@xterm/xterm';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import {
  terminalFastScrollSensitivity,
  type TerminalHandle,
  terminalScrollbackRows,
  terminalScrollSensitivity,
  terminalSmoothScrollDuration,
  XTermTerminal,
} from './xterm-terminal';

const exposedTerminal = () =>
  (window as Window & { __yyorkTerminal?: XTerm }).__yyorkTerminal;

// app.css (with the real --terminal-* tokens + the .dark color-scheme) is not
// loaded under test, so drive the palette off a minimal stylesheet that differs
// between light and dark — the same way the shipped theme does.
const themeStyle = `
  :root {
    --terminal-codex-user-background: rgb(244, 244, 244);
    --terminal-background: rgb(255, 255, 255);
    --terminal-foreground: rgb(10, 10, 10);
    --terminal-scrollbar-slider: rgba(100, 100, 100, 0.4);
    --terminal-scrollbar-slider-active: rgba(0, 0, 0, 0.6);
  }
  .dark {
    color-scheme: dark;
    --terminal-codex-user-background: rgb(39, 39, 39);
    --terminal-background: rgb(10, 10, 10);
    --terminal-foreground: rgb(245, 245, 245);
    --terminal-scrollbar-slider: rgba(121, 121, 121, 0.4);
    --terminal-scrollbar-slider-active: rgba(191, 191, 191, 0.4);
  }
`;

let styleEl: HTMLStyleElement | undefined;

afterEach(() => {
  document.documentElement.classList.remove('dark');
  styleEl?.remove();
  styleEl = undefined;
  vi.restoreAllMocks();
});

const waitForTerminal = () =>
  vi.waitFor(() => {
    const term = exposedTerminal();
    expect(term).toBeTruthy();
    return term as XTerm;
  }, 5_000);

const bufferLineText = (term: XTerm, index: number) =>
  term.buffer.active.getLine(index)?.translateToString(true);

const focusGainedCalls = (onData: ReturnType<typeof vi.fn>) =>
  onData.mock.calls.filter(([data]) => data === '\x1b[I');

function findBufferCell(term: XTerm, text: string) {
  for (let y = 0; y < term.buffer.active.length; y += 1) {
    const line = term.buffer.active.getLine(y);
    const lineText = line?.translateToString();
    const x = lineText?.indexOf(text) ?? -1;
    if (line && x >= 0) {
      return line.getCell(x);
    }
  }

  return undefined;
}

function expectXtermCompatibleColor(value: string | undefined) {
  expect(value).toBeTruthy();
  expect(value).not.toMatch(/\b(?:oklch|color-mix|var)\b/i);
}

test('uses xterm-compatible theme colors from app styles', async () => {
  await render(<XTermTerminal aria-label="terminal" cols={80} rows={24} />);
  const term = await waitForTerminal();

  expectXtermCompatibleColor(term.options.theme?.background);
  expectXtermCompatibleColor(term.options.theme?.foreground);
  expectXtermCompatibleColor(term.options.theme?.cursor);
  expectXtermCompatibleColor(term.options.theme?.cursorAccent);
  expectXtermCompatibleColor(term.options.theme?.selectionBackground);
  expectXtermCompatibleColor(term.options.theme?.selectionInactiveBackground);
  expectXtermCompatibleColor(term.options.theme?.scrollbarSliderBackground);
  expectXtermCompatibleColor(
    term.options.theme?.scrollbarSliderHoverBackground
  );
  expectXtermCompatibleColor(
    term.options.theme?.scrollbarSliderActiveBackground
  );
});

test('answers terminal color queries from the active light theme', async () => {
  styleEl = document.createElement('style');
  styleEl.textContent = themeStyle;
  document.head.appendChild(styleEl);
  document.documentElement.classList.remove('dark');
  const onData = vi.fn();

  await render(
    <XTermTerminal aria-label="terminal" cols={80} onData={onData} rows={24} />
  );
  const term = await waitForTerminal();

  await new Promise<void>((resolve) => {
    term.write('\x1b]10;?\x07\x1b]11;?\x07', resolve);
  });

  expect(onData.mock.calls.map(([data]) => data)).toEqual([
    '\x1b]10;rgb:0a0a/0a0a/0a0a\x1b\\',
    '\x1b]11;rgb:ffff/ffff/ffff\x1b\\',
  ]);
});

test('requests one palette refresh after a replay enables focus reporting', async () => {
  const onData = vi.fn();
  let handle: TerminalHandle | undefined;

  await render(
    <XTermTerminal
      aria-label="terminal"
      cols={80}
      onData={onData}
      onReady={(readyHandle) => {
        handle = readyHandle;
      }}
      rows={24}
    />
  );
  await waitForTerminal();
  await vi.waitFor(() => expect(handle).toBeTruthy());

  await new Promise<void>((resolve) => {
    handle!.write('\x1b[?1004h', resolve);
  });
  expect(focusGainedCalls(onData)).toHaveLength(1);

  await new Promise<void>((resolve) => {
    handle!.write('ordinary output', resolve);
  });
  expect(focusGainedCalls(onData)).toHaveLength(1);

  handle!.queuePaletteSync();
  expect(focusGainedCalls(onData)).toHaveLength(1);
  await new Promise<void>((resolve) => {
    handle!.write('next session replay', resolve);
  });
  expect(focusGainedCalls(onData)).toHaveLength(2);
});

test('requests a live palette refresh for each light and dark transition', async () => {
  styleEl = document.createElement('style');
  styleEl.textContent = themeStyle;
  document.head.appendChild(styleEl);
  document.documentElement.classList.remove('dark');
  const onData = vi.fn();
  let handle: TerminalHandle | undefined;

  await render(
    <XTermTerminal
      aria-label="terminal"
      cols={80}
      onData={onData}
      onReady={(readyHandle) => {
        handle = readyHandle;
      }}
      rows={24}
    />
  );
  const term = await waitForTerminal();
  await vi.waitFor(() => expect(handle).toBeTruthy());
  await new Promise<void>((resolve) => {
    handle!.write('\x1b[?1004h', resolve);
  });
  onData.mockClear();

  document.documentElement.classList.add('dark');
  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(10, 10, 10)');
    expect(focusGainedCalls(onData)).toHaveLength(1);
  });

  document.documentElement.classList.remove('dark');
  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(255, 255, 255)');
    expect(focusGainedCalls(onData)).toHaveLength(2);
  });
});

test('recolors Codex truecolor user blocks in visible history and scrollback', async () => {
  styleEl = document.createElement('style');
  styleEl.textContent = themeStyle;
  document.head.appendChild(styleEl);
  document.documentElement.classList.remove('dark');
  const onData = vi.fn();
  let handle: TerminalHandle | undefined;

  await render(
    <XTermTerminal
      adaptCodexUserMessageBackground
      aria-label="terminal"
      cols={40}
      onData={onData}
      onReady={(readyHandle) => {
        handle = readyHandle;
      }}
      rows={4}
    />
  );
  const term = await waitForTerminal();
  await vi.waitFor(() => expect(handle).toBeTruthy());

  await new Promise<void>((resolve) => {
    handle!.write(
      [
        '\x1b[39;48;2;244;244;244mHISTORICAL\x1b[49m',
        '\r\nline 2\r\nline 3\r\nline 4\r\n',
        '\x1b[48;2;1;2;3mINTENTIONAL\x1b[49m\r\n',
      ].join(''),
      resolve
    );
  });
  // Exercise the WebSocket-frame boundary: xterm accepts split CSI input, and
  // the Codex-specific adapter must preserve that behavior while normalizing.
  handle!.write('\x1b[48;2;244;244;');
  await new Promise<void>((resolve) => {
    handle!.write('244;1mCOMPOSER\x1b[49m', resolve);
  });

  const historicalCell = findBufferCell(term, 'HISTORICAL');
  const composerCell = findBufferCell(term, 'COMPOSER');
  const intentionalCell = findBufferCell(term, 'INTENTIONAL');
  expect(term.buffer.active.baseY).toBeGreaterThan(0);
  expect(historicalCell?.isBgPalette()).toBe(true);
  expect(historicalCell?.getBgColor()).toBe(255);
  expect(composerCell?.isBgPalette()).toBe(true);
  expect(composerCell?.getBgColor()).toBe(255);
  expect(intentionalCell?.isBgRGB()).toBe(true);
  expect(intentionalCell?.getBgColor()).toBe(0x01_02_03);

  document.documentElement.classList.add('dark');
  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(10, 10, 10)');
  });
  onData.mockClear();
  await new Promise<void>((resolve) => {
    handle!.write('\x1b]4;255;?\x07', resolve);
  });
  expect(onData).toHaveBeenCalledWith('\x1b]4;255;rgb:2727/2727/2727\x1b\\');

  document.documentElement.classList.remove('dark');
  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(255, 255, 255)');
  });
  onData.mockClear();
  await new Promise<void>((resolve) => {
    handle!.write('\x1b]4;255;?\x07', resolve);
  });
  expect(onData).toHaveBeenCalledWith('\x1b]4;255;rgb:f4f4/f4f4/f4f4\x1b\\');
});

test('leaves truecolor backgrounds untouched outside Codex adaptation', async () => {
  styleEl = document.createElement('style');
  styleEl.textContent = themeStyle;
  document.head.appendChild(styleEl);
  document.documentElement.classList.remove('dark');
  let handle: TerminalHandle | undefined;

  await render(
    <XTermTerminal
      aria-label="terminal"
      cols={40}
      onReady={(readyHandle) => {
        handle = readyHandle;
      }}
      rows={4}
    />
  );
  const term = await waitForTerminal();
  await vi.waitFor(() => expect(handle).toBeTruthy());
  await new Promise<void>((resolve) => {
    handle!.write('\x1b[48;2;244;244;244mAPPLICATION RGB\x1b[49m', resolve);
  });

  const applicationCell = findBufferCell(term, 'APPLICATION RGB');
  expect(applicationCell?.isBgRGB()).toBe(true);
  expect(applicationCell?.getBgColor()).toBe(0xf4_f4_f4);

  document.documentElement.classList.add('dark');
  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(10, 10, 10)');
  });
  expect(applicationCell?.isBgRGB()).toBe(true);
  expect(applicationCell?.getBgColor()).toBe(0xf4_f4_f4);
});

test('pins the VS Code baseline scrolling options', async () => {
  await render(<XTermTerminal aria-label="terminal" cols={80} rows={24} />);
  const term = await waitForTerminal();

  expect(term.options.scrollSensitivity).toBe(terminalScrollSensitivity);
  expect(term.options.fastScrollSensitivity).toBe(
    terminalFastScrollSensitivity
  );
  expect(term.options.smoothScrollDuration).toBe(terminalSmoothScrollDuration);
  expect(term.options.scrollOnEraseInDisplay).toBe(false);
  expect(term.options.scrollOnUserInput).toBe(true);
});

test('keeps a historical viewport stable across Codex-style ED2 redraws', async () => {
  await render(<XTermTerminal aria-label="terminal" cols={24} rows={5} />);
  const term = await waitForTerminal();
  const lines = Array.from({ length: 30 }, (_, index) => `line-${index + 1}`);

  await new Promise<void>((resolve) => {
    term.write(`${lines.join('\r\n')}\r\nlive prompt`, resolve);
  });
  term.scrollToLine(10);
  const viewportBeforeRedraw = term.buffer.active.viewportY;
  const baseBeforeRedraw = term.buffer.active.baseY;
  expect(viewportBeforeRedraw).toBeLessThan(baseBeforeRedraw);

  await new Promise<void>((resolve) => {
    term.write('\x1b[2J\x1b[Hupdated live screen', resolve);
  });

  expect(term.buffer.active.viewportY).toBe(viewportBeforeRedraw);
  expect(term.buffer.active.baseY).toBe(baseBeforeRedraw);
});

test('keeps browser scrollback for inline terminal output', async () => {
  await render(<XTermTerminal aria-label="terminal" cols={24} rows={5} />);
  const term = await waitForTerminal();
  const lines = Array.from({ length: 12 }, (_, index) => `line-${index + 1}`);

  await new Promise<void>((resolve) => {
    term.write(`${lines.join('\r\n')}\r\nprompt$ `, resolve);
  });

  expect(term.options.scrollback).toBeGreaterThan(0);
  expect(term.buffer.active.baseY).toBeGreaterThan(0);
  expect(term.buffer.active.length).toBeGreaterThan(term.rows);
});

test('retains the beginning of long inline worker transcripts', async () => {
  await render(<XTermTerminal aria-label="terminal" cols={24} rows={5} />);
  const term = await waitForTerminal();
  const lines = Array.from(
    { length: 10_050 },
    (_, index) => `line-${String(index + 1).padStart(5, '0')}`
  );

  await new Promise<void>((resolve) => {
    term.write(`${lines.join('\r\n')}\r\n`, resolve);
  });

  expect(term.options.scrollback).toBe(terminalScrollbackRows);
  expect(terminalScrollbackRows).toBeGreaterThanOrEqual(100_000);
  expect(bufferLineText(term, 0)).toBe('line-00001');
  expect(term.buffer.active.baseY).toBeGreaterThan(10_000);
});

test('lets xterm own normal-buffer wheel scrolling without emitting PTY input', async () => {
  const onData = vi.fn();
  await render(
    <XTermTerminal aria-label="terminal" cols={24} onData={onData} rows={5} />
  );
  const term = await waitForTerminal();
  const lines = Array.from({ length: 30 }, (_, index) => `line-${index + 1}`);

  await new Promise<void>((resolve) => {
    term.write(`${lines.join('\r\n')}\r\n`, resolve);
  });
  const viewportBefore = term.buffer.active.viewportY;
  const screen = document.querySelector<HTMLElement>('.xterm-screen');
  expect(screen).toBeTruthy();

  screen!.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    })
  );

  await vi.waitFor(() => {
    expect(term.buffer.active.viewportY).not.toBe(viewportBefore);
  });
  expect(onData).not.toHaveBeenCalled();
});

test('supports terminal copy and paste shortcuts without stealing Ctrl+C', async () => {
  const onData = vi.fn();
  await render(
    <XTermTerminal aria-label="terminal" cols={24} onData={onData} rows={5} />
  );
  const term = await waitForTerminal();
  const writeText = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValue(undefined);
  const readText = vi
    .spyOn(navigator.clipboard, 'readText')
    .mockResolvedValue('pasted text');

  await new Promise<void>((resolve) => term.write('copy me', resolve));
  term.select(0, 0, 'copy me'.length);
  term.focus();
  const textarea = document.querySelector<HTMLTextAreaElement>(
    '.xterm-helper-textarea'
  );
  expect(textarea).toBeTruthy();

  const copyEvent = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: 'c',
    shiftKey: true,
  });
  textarea!.dispatchEvent(copyEvent);

  await vi.waitFor(() => {
    expect(writeText).toHaveBeenCalledWith('copy me');
  });
  expect(copyEvent.defaultPrevented).toBe(true);
  expect(onData).not.toHaveBeenCalled();

  const pasteEvent = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: 'v',
    shiftKey: true,
  });
  textarea!.dispatchEvent(pasteEvent);

  await vi.waitFor(() => {
    expect(readText).toHaveBeenCalledOnce();
    expect(onData).toHaveBeenCalledWith('pasted text');
  });
  expect(pasteEvent.defaultPrevented).toBe(true);

  onData.mockClear();
  term.clearSelection();
  const interruptEvent = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ctrlKey: true,
    key: 'c',
  });
  // xterm's control-key mapping intentionally uses the legacy keyCode field.
  Object.defineProperty(interruptEvent, 'keyCode', { value: 67 });
  textarea!.dispatchEvent(interruptEvent);
  await vi.waitFor(() => {
    expect(onData).toHaveBeenCalledWith('\x03');
  });
});

// Regression: toggling the app theme recolored the rest of the UI but left the
// terminal on its construction-time palette until a manual refresh remounted
// it. xterm captures `theme` once at construction, so the component watches the
// document root's light/dark class and re-applies the palette when it flips.
test('re-applies the xterm palette when the document theme class toggles', async () => {
  styleEl = document.createElement('style');
  styleEl.textContent = themeStyle;
  document.head.appendChild(styleEl);
  document.documentElement.classList.remove('dark');

  // Render without the theme provider so the test fully owns the root class.
  await render(<XTermTerminal aria-label="terminal" cols={80} rows={24} />);
  const term = await waitForTerminal();

  expect(term.options.theme?.background).toBe('rgb(255, 255, 255)');
  expect(term.options.theme?.scrollbarSliderBackground).toBe(
    'rgba(100, 100, 100, 0.4)'
  );
  expect(term.options.theme?.scrollbarSliderActiveBackground).toBe(
    'rgba(0, 0, 0, 0.6)'
  );
  expect(term.options.minimumContrastRatio).toBe(4.5);

  document.documentElement.classList.add('dark');

  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(10, 10, 10)');
    expect(term.options.theme?.scrollbarSliderBackground).toBe(
      'rgba(121, 121, 121, 0.4)'
    );
    expect(term.options.theme?.scrollbarSliderActiveBackground).toBe(
      'rgba(191, 191, 191, 0.4)'
    );
    expect(term.options.minimumContrastRatio).toBe(1);
  }, 5_000);

  // ...and back to light, to prove the reaction is not a one-shot.
  document.documentElement.classList.remove('dark');

  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(255, 255, 255)');
    expect(term.options.minimumContrastRatio).toBe(4.5);
  }, 5_000);
});
