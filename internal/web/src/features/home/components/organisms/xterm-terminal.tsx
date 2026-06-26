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

/**
 * Minimal terminal surface the TerminalPanel relies on, so its WebSocket and
 * resize plumbing depends on this narrow contract instead of the full xterm.js
 * API (and tests can satisfy it with a stub).
 */
export type TerminalHandle = {
  write(data: string | Uint8Array): void;
  element: HTMLElement;
  cols: number;
  rows: number;
};

type XTermTerminalProps = {
  'aria-label'?: string;
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

// Prefer the WebGL renderer, fall back to 2D canvas. Both rasterize box-drawing
// glyphs themselves (customGlyphs) onto a fixed cell grid, so zellij's borders
// stay crisp. The DOM renderer (no addon) does NOT, so we never rely on it.
function loadRenderer(term: XTerm): void {
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    term.loadAddon(webgl);
    return;
  } catch {
    // WebGL context unavailable — fall through to the canvas renderer.
  }

  try {
    term.loadAddon(new CanvasAddon());
  } catch (error) {
    console.warn(
      'xterm: WebGL and canvas renderers unavailable; box-drawing may drift',
      error
    );
  }
}

export function XTermTerminal(props: XTermTerminalProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // Keep the latest callbacks in a ref so the mount effect can stay
  // dependency-free — we never want to tear down and recreate the terminal just
  // because a handler identity changed between renders.
  const callbacksRef = useRef(props);

  useEffect(() => {
    callbacksRef.current = props;
  });

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
        // Box glyphs are drawn by the renderer, so the font only styles text.
        fontFamily:
          getComputedStyle(host).getPropertyValue('--font-terminal').trim() ||
          'ui-monospace, monospace',
        fontSize: 12,
        lineHeight: 1.35,
        // Zellij's statusline leaves SGR bold active while using ANSI black for
        // Powerline separators; keep bold as weight-only so black stays black.
        drawBoldTextInBrightColors: false,
        // Keep browser-side scrollback for inline agent output. The backend
        // emulator snapshots normal-screen history into this buffer on attach,
        // and Codex is launched with --no-alt-screen so wheel gestures scroll the
        // transcript instead of being translated into prompt-history arrows.
        scrollback: terminalScrollbackRows,
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
      write: (data) => term.write(data),
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
