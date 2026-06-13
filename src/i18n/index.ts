import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import th from './locales/th';
import en from './locales/en';
import lo from './locales/lo';
import zh from './locales/zh';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      th: { translation: th },
      en: { translation: en },
      lo: { translation: lo },
      zh: { translation: zh },
    },
    fallbackLng: 'th',
    defaultNS: 'translation',
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'pos_language',
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
