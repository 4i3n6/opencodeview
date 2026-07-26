import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FlagMap } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { flagMeta } from "@/lib/flags";
import { CHART_COLORS, CHART_CURSOR, CHART_TOOLTIP_STYLE, TONE_COLORS } from "./chartColors";

export function FlagsChart({ flags, title }: { flags: FlagMap; readonly title?: string }) {
  const { t } = useI18n();
  const chartTitle = title ?? t("overview.flagsInCorpus");
  const description = t("chart.flagsDesc");
  const data = Object.entries(flags)
    .map(([flag, count]) => {
      const meta = flagMeta(flag);
      return { flag, label: "labelKey" in meta ? t(meta.labelKey) : meta.label, count, tone: meta.tone };
    })
    .sort((a, b) => b.count - a.count);

  if (data.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("project.noFlags")}</div>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} role="img">
        <title>{chartTitle}</title>
        <desc>{description}</desc>
        <XAxis type="number" stroke={CHART_COLORS.muted} fontSize={11} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          stroke={CHART_COLORS.muted}
          fontSize={11}
          width={130}
          tickLine={false}
        />
        <Tooltip
          cursor={CHART_CURSOR}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Bar dataKey="count" name={t("common.count")} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.flag} fill={TONE_COLORS[d.tone]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
