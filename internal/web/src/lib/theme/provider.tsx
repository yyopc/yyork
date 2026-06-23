import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type ColorTheme = 'light' | 'dark';
type ThemeName = ColorTheme | 'system';

type ThemeContextValue = {
  forcedTheme?: string;
  resolvedTheme?: ColorTheme;
  setTheme: Dispatch<SetStateAction<string>>;
  systemTheme?: ColorTheme;
  theme?: string;
  themes: string[];
};

type ThemeProviderProps = {
  attribute?: 'class';
  children: ReactNode;
  defaultTheme?: ThemeName;
  disableTransitionOnChange?: boolean;
  enableColorScheme?: boolean;
  enableSystem?: boolean;
  forcedTheme?: string;
  storageKey?: string;
  themes?: ThemeName[];
};

const themeContext = createContext<ThemeContextValue>({
  setTheme: () => undefined,
  themes: [],
});

const colorThemes: ColorTheme[] = ['light', 'dark'];
const defaultThemes: ThemeName[] = ['light', 'dark'];
const systemQuery = '(prefers-color-scheme: dark)';

function getSystemTheme(): ColorTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia(systemQuery).matches ? 'dark' : 'light';
}

function normalizeTheme(value: string | undefined, fallback: ThemeName) {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : fallback;
}

function readStoredTheme(storageKey: string, fallback: ThemeName): ThemeName {
  if (typeof window === 'undefined') {
    return fallback;
  }

  try {
    return normalizeTheme(
      localStorage.getItem(storageKey) ?? undefined,
      fallback
    );
  } catch {
    return fallback;
  }
}

function disableTransitions() {
  const style = document.createElement('style');
  style.appendChild(
    document.createTextNode(
      '*,*::before,*::after{transition:none!important;animation:none!important}'
    )
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);
    window.setTimeout(() => style.remove(), 1);
  };
}

function applyTheme(
  theme: ThemeName,
  options: {
    disableTransitionOnChange: boolean;
    enableColorScheme: boolean;
    systemTheme: ColorTheme;
  }
) {
  const resolvedTheme = theme === 'system' ? options.systemTheme : theme;
  const restoreTransitions = options.disableTransitionOnChange
    ? disableTransitions()
    : undefined;

  document.documentElement.classList.remove(...colorThemes);
  document.documentElement.classList.add(resolvedTheme);

  if (options.enableColorScheme) {
    document.documentElement.style.colorScheme = resolvedTheme;
  }

  restoreTransitions?.();
}

export function ThemeProvider({
  attribute = 'class',
  defaultTheme = 'system',
  disableTransitionOnChange = false,
  enableColorScheme = true,
  enableSystem = true,
  forcedTheme,
  storageKey = 'theme',
  themes = defaultThemes,
  children,
}: ThemeProviderProps) {
  if (attribute !== 'class') {
    throw new Error('yyork ThemeProvider only supports class-based themes.');
  }

  const storageFallback = enableSystem ? defaultTheme : 'light';
  const [theme, setThemeState] = useState<ThemeName>(() =>
    readStoredTheme(storageKey, storageFallback)
  );
  const [systemTheme, setSystemTheme] = useState<ColorTheme>(() =>
    getSystemTheme()
  );

  const appliedTheme = normalizeTheme(forcedTheme ?? theme, storageFallback);
  const resolvedTheme =
    appliedTheme === 'system' ? systemTheme : (appliedTheme as ColorTheme);

  const setTheme = useCallback<Dispatch<SetStateAction<string>>>(
    (value) => {
      setThemeState((current) => {
        const next = normalizeTheme(
          typeof value === 'function' ? value(current) : value,
          storageFallback
        );

        try {
          localStorage.setItem(storageKey, next);
        } catch {
          // localStorage can be unavailable in private or restricted contexts.
        }

        return next;
      });
    },
    [storageFallback, storageKey]
  );

  useEffect(() => {
    const media = window.matchMedia(systemQuery);
    const syncSystemTheme = () => setSystemTheme(getSystemTheme());

    syncSystemTheme();
    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
  }, []);

  useEffect(() => {
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      setThemeState(
        normalizeTheme(event.newValue ?? undefined, storageFallback)
      );
    };

    window.addEventListener('storage', syncStoredTheme);
    return () => window.removeEventListener('storage', syncStoredTheme);
  }, [storageFallback, storageKey]);

  useEffect(() => {
    applyTheme(appliedTheme, {
      disableTransitionOnChange,
      enableColorScheme,
      systemTheme,
    });
  }, [appliedTheme, disableTransitionOnChange, enableColorScheme, systemTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      forcedTheme,
      resolvedTheme,
      setTheme,
      systemTheme,
      theme,
      themes: enableSystem ? [...themes, 'system'] : themes,
    }),
    [
      enableSystem,
      forcedTheme,
      resolvedTheme,
      setTheme,
      systemTheme,
      theme,
      themes,
    ]
  );

  return (
    <themeContext.Provider value={value}>{children}</themeContext.Provider>
  );
}

export function useTheme() {
  return useContext(themeContext);
}
