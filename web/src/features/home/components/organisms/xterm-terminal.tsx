import { CanvasAddon } from '@xterm/addon-canvas';
import { FitAddon } from '@xterm/addon-fit';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal as XTerm } from '@xterm/xterm';
import { useEffect, useRef } from 'react';

import '@xterm/xterm/css/xterm.css';

/**
 * Minimal terminal surface the TerminalPanel relies on. The wterm `<Terminal>`
 * (whose `WTerm` instance is a structural superset of this) and this xterm.js
 * wrapper both satisfy it, so the panel's WebSocket/mouse/resize plumbing stays
 * renderer-agnostic and either backend can be dropped in behind a toggle.
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

// xterm.js theme colors must be concrete color strings, but our palette lives
// in CSS custom properties authored as oklch(). Resolve each token through a
// throwaway element so the browser hands back a parseable rgb() value.
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

// Maps our CSS palette (app.css lines ~128-147) onto xterm's theme. ANSI index
// → name follows the standard order: 0-7 normal, 8-15 bright.
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

// Prefer the WebGL renderer, fall back to 2D canvas. Both rasterize box-drawing
// glyphs themselves (customGlyphs) onto a fixed cell grid — which is the whole
// point of this experiment. The DOM renderer (no addon) does NOT, so we never
// rely on it.
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
  callbacksRef.current = props;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let term: XTerm;
    try {
      term = new XTerm({
        // Required for the Unicode 11 width addon below.
        allowProposedApi: true,
        cols: callbacksRef.current.cols,
        cursorBlink: callbacksRef.current.cursorBlink ?? false,
        // Box glyphs are drawn by the renderer, so the font only styles text.
        fontFamily:
          getComputedStyle(host).getPropertyValue('--font-mono').trim() ||
          'ui-monospace, monospace',
        fontSize: 12,
        lineHeight: 1.35,
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

    // Expose live values via getters so the panel always reads the current grid
    // dimensions and element rather than a snapshot taken at ready-time.
    const handle: TerminalHandle = {
      write: (data) => term.write(data),
      get element() {
        return term.element as HTMLElement;
      },
      get cols() {
        return term.cols;
      },
      get rows() {
        return term.rows;
      },
    };
    callbacksRef.current.onReady?.(handle);

    return () => {
      cancelAnimationFrame(raf);
      for (const timer of settleTimers) {
        window.clearTimeout(timer);
      }
      observer.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
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
