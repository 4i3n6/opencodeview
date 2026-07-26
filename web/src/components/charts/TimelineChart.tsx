import { Area, AreaChart, CartesianGrid, Legend, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ConsumptionTimelineRow } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { fmtM } from "@/lib/utils";
import { CHART_COLORS, CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE, COMPOSITION_COLORS } from "./chartColors";

const GAP_START = "2026-06";
const GAP_END = "2026-07";

export function TimelineChart({ rows }: { rows: ConsumptionTimelineRow[] }) {
  const { t } = useI18n();
  const title = t("consumption.monthlyTimeline");
  const description = t("chart.monthlyTimelineDesc");
  if (rows.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.chartNoData")}</div>;

  const hasGap = rows.some((r) => r.month === GAP_START || r.month === GAP_END);

  return (
    <div className="flex flex-col gap-2">
      {hasGap ? (
        <div data-chart-gap-legend="true" className="text-xs leading-snug text-[var(--color-warn)]">
          {t("chart.dataQualityGap")}
        </div>
      ) : null}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={rows} margin={{ left: 4, right: 8, top: 8, bottom: 8 }} role="img">
          <title>{title}</title>
          <desc>{description}</desc>
          <CartesianGrid stroke={CHART_COLORS.border} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="month" stroke={CHART_COLORS.muted} fontSize={11} />
          <YAxis stroke={CHART_COLORS.muted} fontSize={11} tickFormatter={(v) => fmtM(v as number)} />
          <Tooltip
            formatter={(v) => fmtM(Number(v))}
            contentStyle={CHART_TOOLTIP_STYLE}
          />
          <Legend wrapperStyle={CHART_LEGEND_STYLE} />
          {hasGap ? (
            <ReferenceArea
              x1={GAP_START}
              x2={GAP_END}
              fill={CHART_COLORS.warn}
              fillOpacity={0.12}
              stroke={CHART_COLORS.warn}
              strokeOpacity={0.4}
              strokeDasharray="4 4"
            />
          ) : null}
          <Area type="monotone" dataKey="tokens_input" name={t("chart.input")} stackId="tokens" stroke={COMPOSITION_COLORS.input} fill={COMPOSITION_COLORS.input} fillOpacity={0.6} isAnimationActive={false} />
          <Area type="monotone" dataKey="tokens_output" name={t("chart.output")} stackId="tokens" stroke={COMPOSITION_COLORS.output} fill={COMPOSITION_COLORS.output} fillOpacity={0.6} isAnimationActive={false} />
          <Area type="monotone" dataKey="tokens_reasoning" name={t("chart.reasoning")} stackId="tokens" stroke={COMPOSITION_COLORS.reasoning} fill={COMPOSITION_COLORS.reasoning} fillOpacity={0.6} isAnimationActive={false} />
          <Area type="monotone" dataKey="tokens_cache_read" name={t("chart.cacheReuse")} stackId="tokens" stroke={COMPOSITION_COLORS.cache} fill={COMPOSITION_COLORS.cache} fillOpacity={0.6} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
