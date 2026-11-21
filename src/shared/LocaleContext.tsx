import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  getActiveLocale,
  getTranslation,
  setActiveLocale,
  type AppLocale,
  type TranslationCatalog,
} from './i18n';

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (next: AppLocale) => void;
  t: TranslationCatalog;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(() => getActiveLocale());

  const setLocale = (next: AppLocale) => {
    setActiveLocale(next);
    setLocaleState(next);
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value: LocaleContextValue = {
    locale,
    setLocale,
    t: getTranslation(locale),
  };

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    const active = getActiveLocale();
    return {
      locale: active,
      setLocale: setActiveLocale,
      t: getTranslation(active),
    };
  }
  return ctx;
}
