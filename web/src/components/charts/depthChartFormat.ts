import type { Locale } from "@/i18n/catalogs";
import { formatDurationSeconds } from "@/i18n/format";
import { fmtHours } from "@/lib/utils";

export function formatActiveMinuteAxis(minutes: number | null | undefined, locale: Locale): string {
  if (minutes == null || minutes < 0) return "—";
  if (minutes < 60) return formatDurationSeconds(minutes * 60, locale);
  return fmtHours(minutes, locale);
}
