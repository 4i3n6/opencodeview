import { useMemo, useState } from "react";
import type { EfficiencyMatrixRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TableScrollContainer } from "@/components/ui/table";
import { useI18n } from "@/i18n/context";
import { fmtM, fmtPct } from "@/lib/utils";

type Metric = "tokens_per_session" | "reasoning_ratio" | "cache_reuse_rate";

function fmtValue(v: number, metric: Metric): string {
  return metric === "tokens_per_session" ? fmtM(v) : fmtPct(v);
}

const MAX_MODELS = 20;

export function EfficiencyMatrix({ rows }: { rows: EfficiencyMatrixRow[] | undefined }) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<Metric>("tokens_per_session");
  const metricLabel: Record<Metric, string> = {
    tokens_per_session: t("efficiency.tokensPerSession"),
    reasoning_ratio: t("efficiency.reasoningRatio"),
    cache_reuse_rate: t("efficiency.cacheReuse"),
  };

  const { models, agents, cell, max } = useMemo(() => {
    const sessionsByModel = new Map<string, number>();
    for (const r of rows ?? []) sessionsByModel.set(r.model_id, (sessionsByModel.get(r.model_id) ?? 0) + r.sessions);
    const models = [...sessionsByModel.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_MODELS)
      .map(([m]) => m);
    const agents = [...new Set((rows ?? []).map((r) => r.agent))].sort();
    const cell = new Map<string, EfficiencyMatrixRow>();
    for (const r of rows ?? []) cell.set(`${r.model_id}::${r.agent}`, r);
    let max = 0;
    for (const r of rows ?? []) max = Math.max(max, r[metric]);
    return { models, agents, cell, max };
  }, [rows, metric]);

  if (rows == null) return null;
  if (rows.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.chartNoData")}</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(metricLabel) as Metric[]).map((m) => (
            <Button key={m} variant={metric === m ? "solid" : "outline"} aria-pressed={metric === m} onClick={() => setMetric(m)}>
              {metricLabel[m]}
            </Button>
          ))}
        </div>
        <span className="text-xs text-[var(--color-muted)]">{t("efficiency.topModels", { count: MAX_MODELS })}</span>
      </div>
      <TableScrollContainer label={t("efficiency.matrixTableLabel")} hint={t("common.tableScrollHint")}>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[var(--color-panel-2)] text-[var(--color-muted)]">
            <tr>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">{t("chart.modelByAgent")}</th>
              {agents.map((a) => (
                <th key={a} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                  {a}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m} className="border-b">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{m}</td>
                {agents.map((a) => {
                  const r = cell.get(`${m}::${a}`);
                  if (!r) return <td key={a} className="px-3 py-2 text-right text-[var(--color-muted)]">—</td>;
                  const v = r[metric];
                  const intensity = max > 0 && v > 0 ? Math.log1p(v) / Math.log1p(max) : 0;
                  return (
                    <td
                      key={a}
                      className="px-3 py-2 text-right tabular-nums"
                      style={{
                        background: `color-mix(in oklab, var(--color-accent) ${Math.round(intensity * 80)}%, transparent)`,
                      }}
                      title={t("chart.sessionsWithCount", { sessions: r.sessions, messages: r.msgs })}
                    >
                      {fmtValue(v, metric)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScrollContainer>
    </div>
  );
}
