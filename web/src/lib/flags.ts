import type { MessageKey } from "../i18n/catalogs";
import { KNOWN_FLAG_KEYS, isKnownFlag } from "../i18n/mappings";

export type FlagTone = "neutral" | "good" | "warn" | "bad" | "accent" | "purple";

export type FlagMeta =
  | { readonly labelKey: MessageKey; readonly descriptionKey: MessageKey; readonly tone: FlagTone }
  | { readonly label: string; readonly description: string; readonly tone: FlagTone };

export function flagMeta(flag: string): FlagMeta {
  if (isKnownFlag(flag)) {
    const known = KNOWN_FLAG_KEYS[flag];
    return { labelKey: known.label, descriptionKey: known.description, tone: known.tone };
  }
  return { label: flag, tone: "neutral", description: flag };
}

export function parseFlags(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv.split(",").filter(Boolean);
}
