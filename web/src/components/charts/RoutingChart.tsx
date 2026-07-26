import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OrchestrationRoutingRow } from "@/lib/api";
import { useI18n } from "@/i18n/context";
import { ROUTING_CHART_TOOLTIP_LABEL_KEYS } from "@/i18n/mappings";
import { fmtDecimal, fmtDurationS, fmtInt, fmtM } from "@/lib/utils";
import { CHART_COLORS, CHART_CURSOR } from "./chartColors";

function fmtDuration(s: number | null): string {
  return fmtDurationS(s);
}

type RoutingChartRow = OrchestrationRoutingRow & { readonly key: string; readonly tokens: number };

function mergeRows(rows: OrchestrationRoutingRow[], uncategorizedLabel: string): RoutingChartRow[] {
  const buckets = new Map<string, { count: number; tokens: number; durationWeighted: number; bg: number; adds: number; patchOk: number }>();
  for (const r of rows) {
    const key = r.key && r.key.trim() !== "" ? r.key : uncategorizedLabel;
    const b = buckets.get(key) ?? { count: 0, tokens: 0, durationWeighted: 0, bg: 0, adds: 0, patchOk: 0 };
    b.count += r.count;
    b.tokens += r.child_tokens ?? 0;
    if (r.avg_duration_s != null) b.durationWeighted += r.avg_duration_s * r.count;
    b.bg += r.run_in_background_count;
    b.adds += r.child_adds ?? 0;
    b.patchOk += r.child_patch_ok ?? 0;
    buckets.set(key, b);
  }
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    count: b.count,
    child_tokens: b.tokens,
    tokens: b.tokens,
    avg_duration_s: b.count > 0 ? b.durationWeighted / b.count : null,
    run_in_background_count: b.bg,
    child_adds: b.adds,
    child_patch_ok: b.patchOk,
    roi: b.tokens > 0 ? (b.adds / b.tokens) * 1000 : null,
  }));
}

function isRoutingChartRow(value: unknown): value is RoutingChartRow {
  if (typeof value !== "object" || value == null) return false;
  if (!("key" in value) || typeof value.key !== "string") return false;
  if (!("tokens" in value) || typeof value.tokens !== "number") return false;
  if (!("count" in value) || typeof value.count !== "number") return false;
  if (!("run_in_background_count" in value) || typeof value.run_in_background_count !== "number") return false;
  return true;
}

export function RoutingChart({ rows, topN = 12 }: { rows: OrchestrationRoutingRow[]; topN?: number }) {
  const { t } = useI18n();
  const title = t("orchestration.routingTitle");
  const description = t("chart.routingDesc");
  const data = mergeRows(rows, t(ROUTING_CHART_TOOLTIP_LABEL_KEYS.uncategorized))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, topN);

  if (data.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.chartNoData")}</div>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }} role="img">
        <title>{title}</title>
        <desc>{description}</desc>
        <XAxis type="number" stroke={CHART_COLORS.muted} fontSize={11} tickFormatter={(value: number) => fmtM(value)} />
        <YAxis type="category" dataKey="key" stroke={CHART_COLORS.muted} fontSize={11} width={140} tickLine={false} />
        <Tooltip
          cursor={CHART_CURSOR}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const firstPayload = payload[0];
            if (!firstPayload) return null;
            if (!isRoutingChartRow(firstPayload.payload)) return null;
            const r = firstPayload.payload;
            return (
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-2 text-xs">
                <div className="mb-1 font-medium">{r.key}</div>
                <div>{t("orchestration.totalDelegations")}: {fmtInt(r.count)}</div>
                <div>{t("common.tokens")}: {fmtM(r.tokens)}</div>
                <div>{t("common.averageLatency")}: {fmtDuration(r.avg_duration_s)}</div>
                <div>{t(ROUTING_CHART_TOOLTIP_LABEL_KEYS.background)}: {fmtInt(r.run_in_background_count)}</div>
                {r.roi != null ? <div className="text-[var(--color-good)]">{t(ROUTING_CHART_TOOLTIP_LABEL_KEYS.roi)}: {fmtDecimal(r.roi)} {t(ROUTING_CHART_TOOLTIP_LABEL_KEYS.additionsPerThousandTokens)}</div> : null}
                {r.child_patch_ok != null ? <div>{t("common.patchOk")}: {fmtInt(r.child_patch_ok)}</div> : null}
              </div>
            );
          }}
        />
        <Bar dataKey="tokens" fill={CHART_COLORS.accent} radius={[0, 4, 4, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
