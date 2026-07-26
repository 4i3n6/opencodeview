import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LOCALE_STORAGE_KEY,
  readSavedLocale,
} from "./locale";
import { type Locale, translate } from "./catalogs";
import { setFormattingLocale } from "../lib/utils";
import { I18nContext, type I18nContextValue } from "./context";
import { resolveInitialLocaleState } from "./initial";

function initialLocale(): Locale {
  const saved = typeof localStorage === "undefined" ? null : readSavedLocale(localStorage);
  const browserLanguages = typeof navigator === "undefined" ? [] : Array.from(navigator.languages);
  return resolveInitialLocaleState({ saved, browserLanguages });
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  function setLocale(locale: Locale): void {
    setFormattingLocale(locale);
    setLocaleState(locale);
  }

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(locale, "app.documentTitle");
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
