import type { CSSProperties } from "react";
import type { FlagTone } from "@/lib/flags";

export const CHART_COLORS = {
  bg: "#0a0b0f",
  panel: "#12141c",
  panel2: "#171a24",
  border: "#232735",
  muted: "#8b93a7",
  fg: "#e6e9f0",
  accent: "#6ea8fe",
  good: "#34d399",
  warn: "#fbbf24",
  bad: "#f87171",
  purple: "#a78bfa",
  categoryCyan: "#22d3ee",
  categoryPink: "#f472b6",
  categoryLime: "#84cc16",
  categoryOrange: "#fb923c",
  categoryIndigo: "#818cf8",
} as const;

export const COMPOSITION_COLORS = {
  input: CHART_COLORS.accent,
  output: CHART_COLORS.good,
  reasoning: CHART_COLORS.warn,
  cache: CHART_COLORS.purple,
} as const;

export const CATEGORY_COLORS = [
  CHART_COLORS.accent,
  CHART_COLORS.good,
  CHART_COLORS.warn,
  CHART_COLORS.purple,
  CHART_COLORS.bad,
  CHART_COLORS.categoryCyan,
  CHART_COLORS.categoryPink,
  CHART_COLORS.categoryLime,
  CHART_COLORS.categoryOrange,
  CHART_COLORS.categoryIndigo,
] as const;

export const TONE_COLORS: Record<FlagTone, string> = {
  neutral: CHART_COLORS.muted,
  good: CHART_COLORS.good,
  warn: CHART_COLORS.warn,
  bad: CHART_COLORS.bad,
  accent: CHART_COLORS.accent,
  purple: CHART_COLORS.purple,
};

export const CHART_TOOLTIP_STYLE = {
  background: CHART_COLORS.panel,
  border: `1px solid ${CHART_COLORS.border}`,
  borderRadius: 8,
  fontSize: 12,
} as const satisfies CSSProperties;

export const CHART_LEGEND_STYLE = {
  fontSize: 12,
  color: CHART_COLORS.muted,
} as const satisfies CSSProperties;

export const CHART_CURSOR = { fill: CHART_COLORS.panel2 } as const;

export function chartColorForKey(key: string, order: readonly string[]): string {
  const index = order.indexOf(key);
  return CATEGORY_COLORS[(index < 0 ? 0 : index) % CATEGORY_COLORS.length] ?? CHART_COLORS.accent;
}
