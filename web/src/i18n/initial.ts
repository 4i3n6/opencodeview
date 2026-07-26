import { type Locale } from "./catalogs";
import { resolveLocale } from "./locale";
import { setFormattingLocale } from "../lib/utils";

type InitialLocaleInput = {
  readonly saved: string | null;
  readonly browserLanguages: readonly string[];
};

export function resolveInitialLocaleState(input: InitialLocaleInput): Locale {
  const locale = resolveLocale(input);
  setFormattingLocale(locale);
  return locale;
}
