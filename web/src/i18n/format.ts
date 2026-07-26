import type { Locale } from "./catalogs";

export const FORMAT_TIME_ZONE = "UTC";
export const EMPTY_VALUE = "—";

export function formatNumber(value: number | null | undefined, locale: Locale): string {
  if (value == null) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function formatCompactNumber(value: number | null | undefined, locale: Locale): string {
  if (value == null) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, locale: Locale, digits = 1): string {
  if (value == null) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDecimal(value: number | null | undefined, locale: Locale, digits = 1): string {
  if (value == null) return EMPTY_VALUE;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatDurationHours(minutes: number | null | undefined, locale: Locale): string {
  if (minutes == null || minutes < 0) return EMPTY_VALUE;
  const hours = minutes / 60;
  const digits = hours >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(hours);
  return locale === "pt-BR" ? `${number} h` : `${number}h`;
}

export function formatDurationSeconds(seconds: number | null | undefined, locale: Locale): string {
  if (seconds == null || seconds < 0) return EMPTY_VALUE;
  if (seconds < 60) {
    const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds);
    return locale === "pt-BR" ? `${value} s` : `${value}s`;
  }
  const minutes = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(seconds / 60);
  return locale === "pt-BR" ? `${minutes} min` : `${minutes}min`;
}

export function formatElapsedSeconds(seconds: number | null | undefined, locale: Locale): string {
  if (seconds == null || seconds < 0) return EMPTY_VALUE;
  if (seconds < 60) {
    const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(seconds);
    return locale === "pt-BR" ? `${value} s` : `${value}s`;
  }
  if (seconds < 3600) {
    const minutes = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.floor(seconds / 60));
    return locale === "pt-BR" ? `${minutes} min` : `${minutes}min`;
  }
  const hours = formatDecimal(seconds / 3600, locale, 1);
  return locale === "pt-BR" ? `${hours} h` : `${hours}h`;
}

export function formatDurationMs(milliseconds: number | null | undefined, locale: Locale): string {
  if (milliseconds == null || milliseconds < 0) return EMPTY_VALUE;
  return formatDurationSeconds(milliseconds / 1000, locale);
}

export function formatRelativeTime(timestampMs: number | null | undefined, locale: Locale, nowMs: number): string {
  if (timestampMs == null) return EMPTY_VALUE;
  const seconds = Math.floor((timestampMs - nowMs) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "short" });
  const absSeconds = Math.abs(seconds);
  if (absSeconds < 60) return formatter.format(seconds, "second");
  if (absSeconds < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  return formatter.format(Math.round(seconds / 3600), "hour");
}

export function formatYearMonth(value: string, locale: Locale, timeZone = FORMAT_TIME_ZONE): string {
  const [year, month] = value.split("-");
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  if (!Number.isFinite(yearNumber) || !Number.isFinite(monthNumber)) return value;
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone }).format(
    Date.UTC(yearNumber, monthNumber - 1, 1),
  );
}
