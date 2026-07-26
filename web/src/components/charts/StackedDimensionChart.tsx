import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConsumptionRow } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { fmtM } from "@/lib/utils";
import { CHART_COLORS, CHART_CURSOR, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE, COMPOSITION_COLORS } from "./chartColors";

export function StackedDimensionChart({ rows, title, topN = 12 }: { rows: ConsumptionRow[]; readonly title?: string; topN?: number }) {
  const { t } = useI18n();
  const chartTitle = title ?? t("consumption.byModel");
  const description = t("chart.dimensionTokensDesc");
  const data = rows.slice(0, topN).map((r) => ({
    key: r.key,
    input: r.tokens_input,
    output: r.tokens_output,
    reasoning: r.tokens_reasoning,
    cache: r.tokens_cache_read,
  }));
  const seriesNames = {
    input: t("chart.input"),
    output: t("chart.output"),
    reasoning: t("chart.reasoning"),
    cache: t("chart.cacheReuse"),
  } as const;

  if (data.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.chartNoData")}</div>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} role="img">
        <title>{chartTitle}</title>
        <desc>{description}</desc>
        <XAxis type="number" stroke={CHART_COLORS.muted} fontSize={11} tickFormatter={(v) => fmtM(v as number)} />
        <YAxis type="category" dataKey="key" stroke={CHART_COLORS.muted} fontSize={11} width={140} tickLine={false} />
        <Tooltip
          cursor={CHART_CURSOR}
          formatter={(v) => fmtM(Number(v))}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} />
        <Bar dataKey="input" name={seriesNames.input} stackId="tokens" fill={COMPOSITION_COLORS.input} isAnimationActive={false} />
        <Bar dataKey="output" name={seriesNames.output} stackId="tokens" fill={COMPOSITION_COLORS.output} isAnimationActive={false} />
        <Bar dataKey="reasoning" name={seriesNames.reasoning} stackId="tokens" fill={COMPOSITION_COLORS.reasoning} isAnimationActive={false} />
        <Bar dataKey="cache" name={seriesNames.cache} stackId="tokens" fill={COMPOSITION_COLORS.cache} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
