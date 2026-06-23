import { applyMockThemeClass, readMockThemePreference } from './theme-init.js';

const themes = ['system', 'light', 'dark'];

function setMockTheme(theme) {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    // localStorage can be unavailable in restricted contexts.
  }

  applyMockThemeClass(theme);

  const url = new URL(window.location.href);
  url.searchParams.set('theme', theme);
  window.history.replaceState({}, '', url);

  document.dispatchEvent(
    new CustomEvent('mock-theme-change', { detail: { theme } })
  );
}

function syncActiveButtons(container, activeTheme) {
  for (const button of container.querySelectorAll('[data-mock-theme]')) {
    const theme = button.getAttribute('data-mock-theme');
    button.setAttribute(
      'aria-pressed',
      theme === activeTheme ? 'true' : 'false'
    );
    button.classList.toggle('bg-muted', theme === activeTheme);
  }
}

export function mountMockThemeToolbar() {
  if (document.querySelector('[data-mock-theme-toolbar]')) {
    return;
  }

  const container = document.createElement('div');
  container.dataset.mockThemeToolbar = 'true';
  container.className =
    'fixed top-3 right-3 z-50 flex items-center gap-1 rounded-md border border-border bg-background/95 p-1 shadow-sm backdrop-blur-sm';

  const label = document.createElement('span');
  label.className = 'px-2 text-xs text-muted-foreground';
  label.textContent = 'Theme';
  container.appendChild(label);

  let activeTheme = readMockThemePreference();

  for (const theme of themes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mockTheme = theme;
    button.className =
      'cursor-pointer rounded-sm px-2 py-1 text-xs capitalize text-foreground hover:bg-muted/40';
    button.textContent = theme;
    button.addEventListener('click', () => {
      activeTheme = theme;
      setMockTheme(theme);
      syncActiveButtons(container, activeTheme);
    });
    container.appendChild(button);
  }

  syncActiveButtons(container, activeTheme);
  document.body.appendChild(container);
}
