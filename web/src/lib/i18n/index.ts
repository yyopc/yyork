import dayjs from 'dayjs';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { i18nConfig } from '@/lib/i18n/config';

i18n.use(initReactI18next).init(i18nConfig);

export const syncLanguage = (langKey: string) => {
  dayjs.locale(langKey);
};

i18n.on('languageChanged', (langKey) => syncLanguage(langKey));
export default i18n;
