import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ProjectRow } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { fmtM } from "@/lib/utils";
import { CHART_COLORS, CHART_CURSOR, CHART_TOOLTIP_STYLE } from "./chartColors";

export function TokensChart({
  projects,
}: {
  projects: ProjectRow[];
}) {
  const { t } = useI18n();
  const description = t("chart.tokensByProjectDesc");
  const data = projects.slice(0, 14).map((p) => ({
    slug: p.slug,
    id: p.project_id,
    tokens: p.tokens_total,
    flagged: p.flagged,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 40 }} role="img">
        <title>{t("overview.tokensByProject")}</title>
        <desc>{description}</desc>
        <XAxis
          dataKey="slug"
          stroke={CHART_COLORS.muted}
          fontSize={10}
          angle={-40}
          textAnchor="end"
          interval={0}
          height={60}
        />
        <YAxis stroke={CHART_COLORS.muted} fontSize={11} tickFormatter={(v) => fmtM(v as number)} />
        <Tooltip
          cursor={CHART_CURSOR}
          formatter={(v) => fmtM(Number(v))}
          contentStyle={CHART_TOOLTIP_STYLE}
        />
        <Bar isAnimationActive={false}
          dataKey="tokens"
          fill={CHART_COLORS.accent}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
