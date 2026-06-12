import type { Terminal as XTerm } from '@xterm/xterm';
import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { XTermTerminal } from './xterm-terminal';

const exposedTerminal = () =>
  (window as Window & { __yyorkTerminal?: XTerm }).__yyorkTerminal;

// app.css (with the real --terminal-* tokens + the .dark color-scheme) is not
// loaded under test, so drive the palette off a minimal stylesheet that differs
// between light and dark — the same way the shipped theme does.
const themeStyle = `
  :root { --terminal-background: rgb(255, 255, 255); }
  .dark { color-scheme: dark; --terminal-background: rgb(10, 10, 10); }
`;

let styleEl: HTMLStyleElement | undefined;

afterEach(() => {
  document.documentElement.classList.remove('dark');
  styleEl?.remove();
  styleEl = undefined;
});

const waitForTerminal = () =>
  vi.waitFor(() => {
    const term = exposedTerminal();
    expect(term).toBeTruthy();
    return term as XTerm;
  }, 5_000);

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
  expect(term.options.minimumContrastRatio).toBe(4.5);

  document.documentElement.classList.add('dark');

  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(10, 10, 10)');
    expect(term.options.minimumContrastRatio).toBe(1);
  }, 5_000);

  // ...and back to light, to prove the reaction is not a one-shot.
  document.documentElement.classList.remove('dark');

  await vi.waitFor(() => {
    expect(term.options.theme?.background).toBe('rgb(255, 255, 255)');
    expect(term.options.minimumContrastRatio).toBe(4.5);
  }, 5_000);
});
