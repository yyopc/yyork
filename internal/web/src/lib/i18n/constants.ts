import locales from '@/locales';

export type Language = {
  key: keyof typeof locales;
};

export const DEFAULT_NAMESPACE = 'common';

export const DEFAULT_LANGUAGE_KEY: Language['key'] = 'en';

export type LanguageKey = (typeof AVAILABLE_LANGUAGES)[number]['key'];
export const AVAILABLE_LANGUAGES = [
  {
    key: 'en',
  } as const,
] satisfies Language[];
