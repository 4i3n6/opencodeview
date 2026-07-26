import { SUPPORTED_LOCALES, type Locale } from "./catalogs";

export const DEFAULT_LOCALE: Locale = "en-US";
export const LOCALE_STORAGE_KEY = "opencodeview.locale";

export function isLocale(value: string | null | undefined): value is Locale {
  return SUPPORTED_LOCALES.some((locale) => locale === value);
}

function candidateToLocale(candidate: string): Locale {
  return candidate.toLowerCase().startsWith("pt") ? "pt-BR" : "en-US";
}

export function resolveLocale(input: {
  readonly saved?: string | null;
  readonly browserLanguages: readonly string[];
}): Locale {
  if (isLocale(input.saved)) return input.saved;
  for (const candidate of input.browserLanguages) {
    const resolved = candidateToLocale(candidate);
    if (resolved === "pt-BR") return resolved;
  }
  return DEFAULT_LOCALE;
}

export function readSavedLocale(storage: Storage): Locale | null {
  const saved = storage.getItem(LOCALE_STORAGE_KEY);
  return isLocale(saved) ? saved : null;
}
