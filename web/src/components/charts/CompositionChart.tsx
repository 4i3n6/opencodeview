import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useI18n } from "@/i18n/context";
import { fmtM } from "@/lib/utils";
import { CHART_LEGEND_STYLE, CHART_TOOLTIP_STYLE, COMPOSITION_COLORS } from "./chartColors";

export function CompositionChart({
  input,
  output,
  reasoning,
  cache,
}: {
  input: number;
  output: number;
  reasoning: number;
  cache: number;
}) {
  const { t } = useI18n();
  const title = t("consumption.tokenComposition");
  const description = t("chart.tokenCompositionDesc");
  const data = [
    { name: t("chart.input"), value: input, fill: COMPOSITION_COLORS.input },
    { name: t("chart.output"), value: output, fill: COMPOSITION_COLORS.output },
    { name: t("chart.reasoning"), value: reasoning, fill: COMPOSITION_COLORS.reasoning },
    { name: t("chart.cacheReuse"), value: cache, fill: COMPOSITION_COLORS.cache },
  ].filter((d) => d.value > 0);

  if (data.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.chartNoData")}</div>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart role="img">
        <title>{title}</title>
        <desc>{description}</desc>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.fill} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v) => fmtM(Number(v))}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Legend wrapperStyle={CHART_LEGEND_STYLE} />
      </PieChart>
    </ResponsiveContainer>
  );
}
