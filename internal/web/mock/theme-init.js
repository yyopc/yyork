function resolveMockTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function readMockThemePreference() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlTheme = params.get('theme');
    if (urlTheme === 'light' || urlTheme === 'dark' || urlTheme === 'system') {
      return urlTheme;
    }

    const storedTheme = localStorage.getItem('theme');
    if (
      storedTheme === 'light' ||
      storedTheme === 'dark' ||
      storedTheme === 'system'
    ) {
      return storedTheme;
    }
  } catch {
    // localStorage can be unavailable in restricted contexts.
  }

  return 'system';
}

export function applyMockThemeClass(theme = readMockThemePreference()) {
  const resolved = resolveMockTheme(theme);
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(resolved);
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

applyMockThemeClass();
