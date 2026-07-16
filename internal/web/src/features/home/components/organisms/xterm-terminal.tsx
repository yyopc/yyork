import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal as XTerm } from '@xterm/xterm';
import { useEffect, useRef } from 'react';

import '@xterm/xterm/css/xterm.css';

// Keep this aligned with internal/terminalhost's repaint scrollback cap. This
// stays bounded in memory, but needs to cover long worker conversations better
// than xterm/vt's 10k-line default.
export const terminalScrollbackRows = 100_000;
export const terminalScrollSensitivity = 1;
export const terminalFastScrollSensitivity = 5;
export const terminalSmoothScrollDuration = 0;

const codexUserMessagePaletteIndex = 255;
const codexUserMessageRgbPattern = /(^|;)48;2;(?:244;244;244|39;39;39)(?=;|$)/g;
const maximumBufferedCsiBytes = 128;
const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

function concatenateBytes(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) {
    return parts[0] as Uint8Array;
  }

  const result = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0)
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Codex paints submitted user messages with a theme-derived truecolor SGR:
 * 244/244/244 in light mode and 39/39/39 in dark mode. xterm stores truecolor
 * directly in each cell, so those historical cells cannot follow theme
 * changes. For Codex sessions only, normalize those exact SGR parameters to a
 * dedicated indexed color whose OSC 4 value can be updated through xterm's
 * supported escape-sequence API. Other RGB values pass through byte-for-byte.
 */
class CodexUserMessageBackgroundAdapter {
  private pendingCsi = new Uint8Array();

  transform(data: string | Uint8Array): Uint8Array {
    const nextBytes =
      typeof data === 'string' ? textEncoder.encode(data) : data;
    const bytes =
      this.pendingCsi.length === 0
        ? nextBytes
        : concatenateBytes([this.pendingCsi, nextBytes]);
    this.pendingCsi = new Uint8Array();

    const output: Uint8Array[] = [];
    let outputStart = 0;
    let index = 0;
    let pendingStart: number | undefined;

    while (index < bytes.length) {
      if (bytes[index] !== 0x1b) {
        index += 1;
        continue;
      }
      if (index + 1 >= bytes.length) {
        pendingStart = index;
        break;
      }
      if (bytes[index + 1] !== 0x5b) {
        index += 1;
        continue;
      }

      let finalIndex = -1;
      for (let cursor = index + 2; cursor < bytes.length; cursor += 1) {
        const byte = bytes[cursor] as number;
        if (byte >= 0x40 && byte <= 0x7e) {
          finalIndex = cursor;
          break;
        }
      }
      if (finalIndex === -1) {
        if (bytes.length - index <= maximumBufferedCsiBytes) {
          pendingStart = index;
          break;
        }
        index += 1;
        continue;
      }

      if (bytes[finalIndex] === 0x6d) {
        const parameters = textDecoder.decode(
          bytes.subarray(index + 2, finalIndex)
        );
        const normalizedParameters = parameters.replace(
          codexUserMessageRgbPattern,
          (_match, prefix: string) =>
            `${prefix}48;5;${codexUserMessagePaletteIndex}`
        );
        if (normalizedParameters !== parameters) {
          if (outputStart < index) {
            output.push(bytes.subarray(outputStart, index));
          }
          output.push(textEncoder.encode(`\x1b[${normalizedParameters}m`));
          outputStart = finalIndex + 1;
        }
      }
      index = finalIndex + 1;
    }

    const outputEnd = pendingStart ?? bytes.length;
    if (outputStart < outputEnd) {
      output.push(bytes.subarray(outputStart, outputEnd));
    }
    if (pendingStart !== undefined) {
      this.pendingCsi = bytes.slice(pendingStart);
    }

    return output.length === 0 ? new Uint8Array() : concatenateBytes(output);
  }

  flush(): Uint8Array {
    const pendingCsi = this.pendingCsi;
    this.pendingCsi = new Uint8Array();
    return pendingCsi;
  }
}

/**
 * Minimal terminal surface the TerminalPanel relies on, so its WebSocket and
 * resize plumbing depends on this narrow contract instead of the full xterm.js
 * API (and tests can satisfy it with a stub).
 */
export type TerminalHandle = {
  getScrollState(): { baseY: number; viewportY: number };
  /**
   * Ask the attached program to re-query xterm's live default colors after the
   * next replay restores focus reporting. Keeping this queued avoids sending a
   * focus event to the session that is being replaced.
   */
  queuePaletteSync(): void;
  scrollToLine(line: number): void;
  write(data: string | Uint8Array, onParsed?: () => void): void;
  /**
   * Used by TerminalPanel after a selected session's replay bytes have parsed,
   * so the reused xterm instance opens on the latest prompt instead of the top
   * of scrollback.
   */
  scrollToBottom(): void;
  element: HTMLElement;
  cols: number;
  rows: number;
};

type XTermTerminalProps = {
  'aria-label'?: string;
  adaptCodexUserMessageBackground?: boolean;
  className?: string;
  cols?: number;
  cursorBlink?: boolean;
  onData?: (data: string) => void;
  onError?: (error: unknown) => void;
  onReady?: (terminal: TerminalHandle) => void;
  onResize?: (cols: number, rows: number) => void;
  rows?: number;
};

// xterm.js theme colors must be concrete strings its canvas renderer accepts.
// Resolve each terminal token through a throwaway element so theme updates read
// the effective CSS value while keeping the xterm-facing tokens in app.css
// constrained to renderer-compatible formats.
function resolveColor(
  host: HTMLElement,
  variable: string,
  fallback: string
): string {
  const probe = document.createElement('span');
  probe.style.color = `var(${variable})`;
  probe.style.display = 'none';
  host.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  host.removeChild(probe);
  return resolved || fallback;
}

// Maps the terminal-tuned ANSI palette from app.css (the --terminal-color-*
// custom properties, set per light/dark theme) onto xterm's theme. ANSI index
// → name follows the standard order: 0-7 normal, 8-15 bright. Fallbacks are
// VS Code's default dark palette, so they read well if a token ever resolves
// empty.
function buildTheme(host: HTMLElement) {
  return {
    background: resolveColor(host, '--terminal-background', '#1e1e1e'),
    foreground: resolveColor(host, '--terminal-foreground', '#d4d4d4'),
    cursor: resolveColor(host, '--terminal-cursor', '#ffffff'),
    cursorAccent: resolveColor(host, '--terminal-background', '#1e1e1e'),
    selectionBackground: resolveColor(
      host,
      '--terminal-selection',
      'rgba(255, 255, 255, 0.3)'
    ),
    selectionInactiveBackground: resolveColor(
      host,
      '--terminal-selection-inactive',
      'rgba(255, 255, 255, 0.15)'
    ),
    scrollbarSliderBackground: resolveColor(
      host,
      '--terminal-scrollbar-slider',
      'rgba(121, 121, 121, 0.4)'
    ),
    scrollbarSliderHoverBackground: resolveColor(
      host,
      '--terminal-scrollbar-slider-hover',
      'rgba(100, 100, 100, 0.7)'
    ),
    scrollbarSliderActiveBackground: resolveColor(
      host,
      '--terminal-scrollbar-slider-active',
      'rgba(191, 191, 191, 0.4)'
    ),
    black: resolveColor(host, '--terminal-color-0', '#000000'),
    red: resolveColor(host, '--terminal-color-1', '#cd3131'),
    green: resolveColor(host, '--terminal-color-2', '#0dbc79'),
    yellow: resolveColor(host, '--terminal-color-3', '#e5e510'),
    blue: resolveColor(host, '--terminal-color-4', '#2472c8'),
    magenta: resolveColor(host, '--terminal-color-5', '#bc3fbc'),
    cyan: resolveColor(host, '--terminal-color-6', '#11a8cd'),
    white: resolveColor(host, '--terminal-color-7', '#e5e5e5'),
    brightBlack: resolveColor(host, '--terminal-color-8', '#666666'),
    brightRed: resolveColor(host, '--terminal-color-9', '#f14c4c'),
    brightGreen: resolveColor(host, '--terminal-color-10', '#23d18b'),
    brightYellow: resolveColor(host, '--terminal-color-11', '#f5f543'),
    brightBlue: resolveColor(host, '--terminal-color-12', '#3b8eea'),
    brightMagenta: resolveColor(host, '--terminal-color-13', '#d670d6'),
    brightCyan: resolveColor(host, '--terminal-color-14', '#29b8db'),
    brightWhite: resolveColor(host, '--terminal-color-15', '#ffffff'),
  };
}

function usesDarkColorScheme(host: HTMLElement): boolean {
  const colorScheme = getComputedStyle(host)
    .colorScheme.split(/\s+/)
    .filter(Boolean);

  return colorScheme.includes('dark');
}

// On the light theme, keep xterm's contrast correction so dim colors do not
// disappear against white. On the dark theme, let the configured ANSI palette
// render as-is; otherwise xterm pushes many colors toward foreground white and
// Zellij/agent output starts looking monochrome.
function minimumContrastRatioFor(usesDark: boolean): number {
  return usesDark ? 1 : 4.5;
}

function buildCodexUserMessagePaletteSequence(
  host: HTMLElement,
  usesDark: boolean
): string {
  const color = resolveColor(
    host,
    '--terminal-codex-user-background',
    usesDark ? 'rgb(39, 39, 39)' : 'rgb(244, 244, 244)'
  );
  const channels = color.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/
  );
  const fallbackChannel = usesDark ? '39' : '244';
  const rgb = (
    channels?.slice(1, 4) ?? [fallbackChannel, fallbackChannel, fallbackChannel]
  ).map((channel) =>
    Math.max(0, Math.min(255, Math.round(Number(channel))))
      .toString(16)
      .padStart(2, '0')
  );

  return `\x1b]4;${codexUserMessagePaletteIndex};rgb:${rgb.join('/')}\x1b\\`;
}

const resetCodexUserMessagePaletteSequence = `\x1b]104;${codexUserMessagePaletteIndex}\x1b\\`;

// Prefer the WebGL renderer, fall back to 2D canvas. Both rasterize box-drawing
// glyphs themselves (customGlyphs) onto a fixed cell grid, so zellij's borders
// stay crisp. The DOM renderer (no addon) does NOT, so we never rely on it.
function loadCanvasRenderer(term: XTerm): void {
  try {
    term.loadAddon(new CanvasAddon());
  } catch (error) {
    console.warn(
      'xterm: canvas renderer unavailable; using DOM renderer',
      error
    );
  }
}

function loadRenderer(term: XTerm): void {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      webgl.dispose();
      loadCanvasRenderer(term);
    });
    term.loadAddon(webgl);
    return;
  } catch {
    // WebGL context unavailable — fall through to the canvas renderer.
  }

  loadCanvasRenderer(term);
}

function attachClipboardShortcuts(term: XTerm): void {
  term.attachCustomKeyEventHandler((event) => {
    if (
      event.type !== 'keydown' ||
      !event.ctrlKey ||
      !event.shiftKey ||
      event.altKey ||
      event.metaKey
    ) {
      return true;
    }

    const key = event.key.toLowerCase();
    if (key === 'c') {
      if (!term.hasSelection()) {
        // Match VS Code's terminal shortcut: copy is a no-op without a
        // selection, while plain Ctrl+C remains untouched and reaches the PTY.
        event.preventDefault();
        return false;
      }

      if (!navigator.clipboard?.writeText) {
        // Let the browser's native copy event reach xterm's built-in handler.
        return false;
      }

      event.preventDefault();
      void navigator.clipboard
        .writeText(term.getSelection())
        .catch((error: unknown) => {
          console.warn('xterm: unable to copy terminal selection', error);
        });
      return false;
    }

    if (key === 'v') {
      if (!navigator.clipboard?.readText) {
        // The native paste event remains wired by xterm.js.
        return false;
      }

      event.preventDefault();
      void navigator.clipboard
        .readText()
        .then((text) => term.paste(text))
        .catch((error: unknown) => {
          console.warn('xterm: unable to paste clipboard text', error);
        });
      return false;
    }

    return true;
  });
}

export function XTermTerminal(props: XTermTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const setCodexBackgroundAdaptationRef = useRef<
    ((enabled: boolean) => void) | null
  >(null);
  // Keep the latest callbacks in a ref so the mount effect can stay
  // dependency-free — we never want to tear down and recreate the terminal just
  // because a handler identity changed between renders.
  const callbacksRef = useRef(props);

  useEffect(() => {
    callbacksRef.current = props;
  });

  useEffect(() => {
    setCodexBackgroundAdaptationRef.current?.(
      props.adaptCodexUserMessageBackground ?? false
    );
  }, [props.adaptCodexUserMessageBackground]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    // Tracks whether the app is currently on its dark theme. The terminal's
    // palette and contrast correction both key off this, and it is re-read when
    // the theme toggles (the MutationObserver below) so the live grid recolors.
    let usesDark = usesDarkColorScheme(host);

    let term: XTerm;
    try {
      term = new XTerm({
        // Required for the Unicode 11 width addon below.
        allowProposedApi: true,
        cols: callbacksRef.current.cols,
        cursorBlink: callbacksRef.current.cursorBlink ?? false,
        cursorInactiveStyle: 'outline',
        customGlyphs: true,
        // Box glyphs are drawn by the renderer, so the font only styles text.
        fontFamily:
          getComputedStyle(host).getPropertyValue('--font-terminal').trim() ||
          'ui-monospace, monospace',
        fontSize: 12,
        lineHeight: 1.35,
        // Zellij's statusline leaves SGR bold active while using ANSI black for
        // Powerline separators; keep bold as weight-only so black stays black.
        drawBoldTextInBrightColors: false,
        fastScrollSensitivity: terminalFastScrollSensitivity,
        // Keep browser-side scrollback for inline agent output. The backend
        // emulator snapshots normal-screen history into this buffer on attach,
        // and Codex is launched with --no-alt-screen so wheel gestures scroll the
        // transcript instead of being translated into prompt-history arrows.
        scrollback: terminalScrollbackRows,
        scrollOnUserInput: true,
        scrollSensitivity: terminalScrollSensitivity,
        smoothScrollDuration: terminalSmoothScrollDuration,
        minimumContrastRatio: minimumContrastRatioFor(usesDark),
        rows: callbacksRef.current.rows,
        theme: buildTheme(host),
      });
    } catch (error) {
      callbacksRef.current.onError?.(error);
      return undefined;
    }

    const fit = new FitAddon();
    term.loadAddon(fit);
    const unicode = new Unicode11Addon();
    term.loadAddon(unicode);
    term.unicode.activeVersion = '11';

    term.open(host);
    loadRenderer(term);
    attachClipboardShortcuts(term);

    // Codex re-queries OSC 10/11 when it receives FocusIn. Terminalhost restores
    // DECSET 1004 in each browser replay, so wait until xterm has parsed that
    // mode before asking Codex to refresh its palette. This also keeps the
    // headless startup fallback independent from the browser's live theme.
    let paletteSyncPending = true;
    const syncPaletteIfReady = () => {
      if (!paletteSyncPending || !term.modes.sendFocusMode) {
        return;
      }

      paletteSyncPending = false;
      callbacksRef.current.onData?.('\x1b[I');
    };

    let codexBackgroundAdapter: CodexUserMessageBackgroundAdapter | undefined;
    let codexBackgroundAdaptationEnabled = false;
    const setCodexBackgroundAdaptation = (enabled: boolean) => {
      if (enabled === codexBackgroundAdaptationEnabled) {
        return;
      }

      const pendingCsi = codexBackgroundAdapter?.flush();
      if (pendingCsi && pendingCsi.length > 0) {
        term.write(pendingCsi);
      }
      codexBackgroundAdaptationEnabled = enabled;
      codexBackgroundAdapter = enabled
        ? new CodexUserMessageBackgroundAdapter()
        : undefined;
      term.write(
        enabled
          ? buildCodexUserMessagePaletteSequence(host, usesDark)
          : resetCodexUserMessagePaletteSequence
      );
    };
    setCodexBackgroundAdaptationRef.current = setCodexBackgroundAdaptation;
    setCodexBackgroundAdaptation(
      callbacksRef.current.adaptCodexUserMessageBackground ?? false
    );

    // React to app theme toggles. next-themes flips a light/dark class on the
    // document root, swapping the --terminal-* custom properties — but xterm
    // captured its palette once, at construction, so without this the grid kept
    // the old colors until a manual refresh remounted it. Re-resolve and
    // re-apply on each flip. theme is an object option that xterm
    // reference-compares, so it only takes effect when assigned a fresh object;
    // buildTheme always returns one.
    const themeObserver = new MutationObserver(() => {
      const nextUsesDark = usesDarkColorScheme(host);
      // Unrelated root-class changes don't touch the terminal palette; only the
      // light/dark flip does, so skip the (full-grid) recolor otherwise.
      if (nextUsesDark === usesDark) {
        return;
      }
      usesDark = nextUsesDark;
      term.options.theme = buildTheme(host);
      term.options.minimumContrastRatio = minimumContrastRatioFor(usesDark);
      paletteSyncPending = true;
      if (codexBackgroundAdaptationEnabled) {
        term.write(buildCodexUserMessagePaletteSequence(host, usesDark), () => {
          syncPaletteIfReady();
        });
      } else {
        syncPaletteIfReady();
      }
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ['class'],
    });

    // Expose the live instance for e2e: the WebGL/canvas renderers leave no
    // text in the DOM, so tests read the screen through term.buffer instead.
    const exposedWindow = window as Window & { __yyorkTerminal?: XTerm };
    exposedWindow.__yyorkTerminal = term;

    const dataDisposable = term.onData((data) => {
      callbacksRef.current.onData?.(data);
    });
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      callbacksRef.current.onResize?.(cols, rows);
    });

    let lastCols = 0;
    let lastRows = 0;
    const fitAndReport = () => {
      try {
        fit.fit();
      } catch {
        // Container momentarily has no size (hidden/unmounting) — ignore.
        return;
      }

      // Only SIGWINCH the PTY when the grid actually changed, so the repeated
      // settle-fits below don't spam resizes at the attached program.
      if (term.cols !== lastCols || term.rows !== lastRows) {
        lastCols = term.cols;
        lastRows = term.rows;
        callbacksRef.current.onResize?.(term.cols, term.rows);
      }
    };

    // FitAddon derives the column count from the measured cell width. If it runs
    // before the monospace font's real metrics are resolved, it measures a
    // too-narrow cell, over-counts columns, and the grid overflows the panel to
    // the right once the true (wider) glyphs paint. So fit on several triggers:
    // next frame, after fonts settle, and after layout has flushed twice.
    const raf = requestAnimationFrame(fitAndReport);
    const settleTimers = [
      window.setTimeout(fitAndReport, 50),
      window.setTimeout(fitAndReport, 250),
    ];
    if (document.fonts?.ready) {
      void document.fonts.ready.then(fitAndReport);
    }

    const observer = new ResizeObserver(fitAndReport);
    observer.observe(host);

    // Expose live values so the panel reads the current grid dimensions and
    // element rather than a snapshot taken at ready-time.
    const handle = {
      getScrollState: () => ({
        baseY: term.buffer.active.baseY,
        viewportY: term.buffer.active.viewportY,
      }),
      queuePaletteSync: () => {
        paletteSyncPending = true;
      },
      scrollToLine: (line) => term.scrollToLine(line),
      write: (data, onParsed) => {
        const adaptedData = codexBackgroundAdapter?.transform(data) ?? data;
        if (adaptedData instanceof Uint8Array && adaptedData.length === 0) {
          onParsed?.();
          return;
        }
        term.write(adaptedData, () => {
          syncPaletteIfReady();
          onParsed?.();
        });
      },
      scrollToBottom: () => term.scrollToBottom(),
    } as TerminalHandle;
    Object.defineProperties(handle, {
      element: {
        enumerable: true,
        get: () => term.element as HTMLElement,
      },
      cols: {
        enumerable: true,
        get: () => term.cols,
      },
      rows: {
        enumerable: true,
        get: () => term.rows,
      },
    });
    callbacksRef.current.onReady?.(handle);

    return () => {
      cancelAnimationFrame(raf);
      for (const timer of settleTimers) {
        window.clearTimeout(timer);
      }
      themeObserver.disconnect();
      observer.disconnect();
      if (
        setCodexBackgroundAdaptationRef.current === setCodexBackgroundAdaptation
      ) {
        setCodexBackgroundAdaptationRef.current = null;
      }
      dataDisposable.dispose();
      resizeDisposable.dispose();
      if (exposedWindow.__yyorkTerminal === term) {
        delete exposedWindow.__yyorkTerminal;
      }
      term.dispose();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-label={props['aria-label']}
      className={props.className}
      style={{ height: '100%', overflow: 'hidden', width: '100%' }}
    />
  );
}
