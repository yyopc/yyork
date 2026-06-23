import { type ReactNode, StrictMode, useEffect, useRef } from 'react';

import { useTheme } from '@/lib/theme/provider';
import { useHydrated } from '@/hooks/use-hydrated';

import { ThemeSwitcher } from '@/components/ui/theme-switcher';

import { Providers } from '@/providers';

function MockThemeUrlSync() {
  const { setTheme, theme } = useTheme();
  const hydrated = useHydrated();
  const initializedFromUrl = useRef(false);

  useEffect(() => {
    if (!hydrated || initializedFromUrl.current) {
      return;
    }

    initializedFromUrl.current = true;
    const urlTheme = new URLSearchParams(window.location.search).get('theme');

    if (urlTheme === 'light' || urlTheme === 'dark' || urlTheme === 'system') {
      setTheme(urlTheme);
    }
  }, [hydrated, setTheme]);

  useEffect(() => {
    if (!hydrated || !theme) {
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.get('theme') === theme) {
      return;
    }

    url.searchParams.set('theme', theme);
    window.history.replaceState({}, '', url);
  }, [hydrated, theme]);

  return null;
}

function MockThemeToolbar() {
  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-2 rounded-md border border-border bg-background/95 px-2 py-1 shadow-sm backdrop-blur-sm">
      <span className="text-xs text-muted-foreground">Theme</span>
      <ThemeSwitcher
        iconOnly
        triggerSize="sm"
        triggerVariant="outline"
        triggerLabel="Theme"
      />
    </div>
  );
}

export function MockDesignShell(props: { children: ReactNode }) {
  return (
    <StrictMode>
      <Providers>
        <MockThemeUrlSync />
        <MockThemeToolbar />
        {props.children}
      </Providers>
    </StrictMode>
  );
}
