import { afterEach, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ThemeProvider, useTheme } from './provider';

const storageKey = 'yyork-theme-provider-test';

function ThemeProbe() {
  const { resolvedTheme, setTheme, theme } = useTheme();

  return (
    <button type="button" onClick={() => setTheme('dark')}>
      {theme}:{resolvedTheme}
    </button>
  );
}

afterEach(() => {
  localStorage.removeItem(storageKey);
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.style.colorScheme = '';
});

test('applies and persists theme without rendering scripts', async () => {
  await render(
    <ThemeProvider defaultTheme="light" storageKey={storageKey}>
      <ThemeProbe />
    </ThemeProvider>
  );

  await vi.waitFor(() => {
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
  expect(document.body.querySelector('script')).toBeNull();

  document.querySelector('button')?.click();

  await vi.waitFor(() => {
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(storageKey)).toBe('dark');
  });
});
