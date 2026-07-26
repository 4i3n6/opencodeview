import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Locale } from "@/i18n/catalogs";
import {
  formatCompactNumber,
  formatDecimal,
  formatElapsedSeconds,
  formatDurationHours,
  formatDurationMs,
  formatDurationSeconds,
  formatNumber,
  formatPercent,
} from "../i18n/format";

let activeLocale: Locale = "en-US";

export function setFormattingLocale(locale: Locale): void {
  activeLocale = locale;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtInt(n: number | null | undefined, locale: Locale = activeLocale): string {
  return formatNumber(n, locale);
}

export function fmtM(n: number | null | undefined, locale: Locale = activeLocale): string {
  return formatCompactNumber(n, locale);
}

export function fmtHours(min: number | null | undefined, locale: Locale = activeLocale): string {
  return formatDurationHours(min, locale);
}

export function fmtPct(x: number | null | undefined, localeOrDigits: Locale | number = activeLocale, digits = 1): string {
  const locale = typeof localeOrDigits === "number" ? activeLocale : localeOrDigits;
  const fractionDigits = typeof localeOrDigits === "number" ? localeOrDigits : digits;
  return formatPercent(x, locale, fractionDigits);
}

export function fmtDecimal(n: number | null | undefined, digits = 1, locale: Locale = activeLocale): string {
  return formatDecimal(n, locale, digits);
}

export function fmtDurationMs(ms: number | null | undefined, locale: Locale = activeLocale): string {
  return formatDurationMs(ms, locale);
}

export function fmtDurationS(s: number | null | undefined, locale: Locale = activeLocale): string {
  return formatDurationSeconds(s, locale);
}

export function fmtElapsedS(s: number | null | undefined, locale: Locale = activeLocale): string {
  return formatElapsedSeconds(s, locale);
}

/**
 * Wilson score interval for a binomial proportion (95% confidence).
 * Used as a client-side fallback when the API does not provide
 * pre-computed lo/hi bounds for an error rate.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 0 };
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (center - margin) / denom), hi: Math.min(1, (center + margin) / denom) };
}

export function parseModel(raw: string | null): { id: string; provider?: string; variant?: string } | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isModelPayload(parsed)) return null;
    return {
      id: parsed.id,
      ...(parsed.providerID ? { provider: parsed.providerID } : {}),
      ...(parsed.variant ? { variant: parsed.variant } : {}),
    };
  } catch {
    return { id: raw };
  }
}

function isModelPayload(value: unknown): value is { readonly id: string; readonly providerID?: string; readonly variant?: string } {
  if (typeof value !== "object" || value == null) return false;
  if (!("id" in value) || typeof value.id !== "string") return false;
  if ("providerID" in value && typeof value.providerID !== "string") return false;
  if ("variant" in value && typeof value.variant !== "string") return false;
  return true;
}
