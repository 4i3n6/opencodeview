import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OrchestrationDepthRow } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { fmtM } from "@/lib/utils";
import { CHART_COLORS, CHART_CURSOR, CHART_TOOLTIP_STYLE } from "./chartColors";
import { formatActiveMinuteAxis } from "./depthChartFormat";

export function DepthChart({ rows }: { rows: OrchestrationDepthRow[] }) {
  const { locale, t } = useI18n();
  const title = t("orchestration.depthTitle");
  const description = t("chart.depthDesc");
  const data = [...rows]
    .sort((a, b) => a.spawn_depth - b.spawn_depth)
    .map((r) => ({
      depth: r.spawn_depth === 0 ? t("chart.primaryDepth") : String(r.spawn_depth),
      tokens: r.tokens,
      active_min: r.active_min ?? 0,
      sessions: r.sessions,
    }));

  if (data.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.chartNoData")}</div>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }} role="img">
        <title>{title}</title>
        <desc>{description}</desc>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.border} vertical={false} />
        <XAxis dataKey="depth" stroke={CHART_COLORS.muted} fontSize={11} label={{ value: t("chart.spawnDepth"), position: "insideBottom", offset: -2, fill: CHART_COLORS.muted, fontSize: 11 }} />
        <YAxis yAxisId="tokens" stroke={CHART_COLORS.accent} fontSize={11} tickFormatter={(v) => fmtM(v as number)} />
        <YAxis yAxisId="time" orientation="right" stroke={CHART_COLORS.purple} fontSize={11} tickFormatter={(v) => formatActiveMinuteAxis(v as number, locale)} />
        <Tooltip
          cursor={CHART_CURSOR}
          formatter={(v, name) => (name === t("chart.tokens") ? fmtM(Number(v)) : formatActiveMinuteAxis(Number(v), locale))}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar yAxisId="tokens" dataKey="tokens" name={t("chart.tokens")} fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar yAxisId="time" dataKey="active_min" name={t("chart.activeTime")} fill={CHART_COLORS.purple} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
