import { enAnalytics, ptAnalytics } from "./messages/analytics";
import { enCommon, ptCommon } from "./messages/common";
import { enDashboard, ptDashboard } from "./messages/dashboard";
import { enLiveTranscript, ptLiveTranscript } from "./messages/live-transcript";

export const SUPPORTED_LOCALES = ["en-US", "pt-BR"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const en = {
  ...enCommon,
  ...enDashboard,
  ...enAnalytics,
  ...enLiveTranscript,
} as const;

type CanonicalCatalog = { readonly [K in keyof typeof en]: string };

const pt = {
  ...ptCommon,
  ...ptDashboard,
  ...ptAnalytics,
  ...ptLiveTranscript,
} satisfies CanonicalCatalog;

export type MessageKey = keyof CanonicalCatalog;
export const messageKeys = Object.keys(en);

export function isMessageKey(key: string): key is MessageKey {
  return key in en;
}

export const catalogs = {
  "en-US": en,
  "pt-BR": pt,
} as const satisfies Record<Locale, CanonicalCatalog>;

export type MessageValues = Readonly<Record<string, string | number>>;

export function translate(locale: Locale, key: MessageKey, values?: MessageValues): string {
  const template = catalogs[locale][key] ?? catalogs["en-US"][key];
  if (!values) return template;
  let message = template;
  for (const [name, value] of Object.entries(values)) {
    message = message.replaceAll(`{${name}}`, String(value));
  }
  return message;
}
