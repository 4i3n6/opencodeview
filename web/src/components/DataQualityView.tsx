import { useMemo } from "react";
import { useDataQuality } from "@/lib/api";
import { InfoBadge } from "@/components/InfoBadge";
import { PanelStatus } from "@/components/PanelStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableScrollContainer } from "@/components/ui/table";
import { fmtPct } from "@/lib/utils";
import { useI18n } from "@/i18n/context";

function coverageColor(coverage: number, isGap: number): string {
  if (isGap) return "bg-[color-mix(in_oklab,var(--color-bad)_35%,transparent)]";
  if (coverage >= 0.95) return "bg-[color-mix(in_oklab,var(--color-good)_28%,transparent)]";
  if (coverage >= 0.8) return "bg-[color-mix(in_oklab,var(--color-good)_12%,transparent)]";
  if (coverage >= 0.5) return "bg-[color-mix(in_oklab,var(--color-warn)_20%,transparent)]";
  return "bg-[color-mix(in_oklab,var(--color-warn)_35%,transparent)]";
}

export function DataQualityView() {
  const { t } = useI18n();
  const { data: rows, isLoading, isError } = useDataQuality();

  const { fields, months, byCell, gapCount } = useMemo(() => {
    const fields = [...new Set((rows ?? []).map((r) => r.field))].sort();
    const months = [...new Set((rows ?? []).map((r) => r.month))].sort();
    const byCell = new Map<string, (typeof rows extends (infer T)[] | undefined ? T : never)>();
    let gapCount = 0;
    for (const r of rows ?? []) {
      byCell.set(`${r.field}__${r.month}`, r);
      if (r.is_gap) gapCount += 1;
    }
    return { fields, months, byCell, gapCount };
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-[var(--color-muted)]">
        {t("quality.globalScopeHint")}
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("quality.fieldCoverage")}</CardTitle>
          <InfoBadge kind="quality" />
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs text-[var(--color-muted)]">
            {t("quality.coverageDescription")}
            {rows ? ` · ${t("quality.gapsDetected", { count: gapCount })}` : ""}
          </div>
          {isError ? (
            <PanelStatus kind="error" minHeightClassName="min-h-24" />
          ) : isLoading ? (
            <div className="text-sm text-[var(--color-muted)]">{t("common.loading")}</div>
          ) : !rows || rows.length === 0 ? (
            <div className="text-sm text-[var(--color-muted)]">{t("quality.empty")}</div>
          ) : (
            <TableScrollContainer label={t("quality.coverageTableLabel")} hint={t("common.tableScrollHint")}>
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[var(--color-panel-2)] text-[var(--color-muted)]">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2 text-left font-medium">{t("common.field")}</th>
                    {months.map((m) => (
                      <th key={m} className="whitespace-nowrap px-3 py-2 text-right font-medium">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f} className="border-b">
                      <td className="whitespace-nowrap px-3 py-2 font-medium">{f}</td>
                      {months.map((m) => {
                        const cell = byCell.get(`${f}__${m}`);
                        if (!cell) return <td key={m} className="px-3 py-2 text-right text-[var(--color-muted)]">—</td>;
                        return (
                          <td
                            key={m}
                            className={`px-3 py-2 text-right tabular-nums ${coverageColor(cell.coverage, cell.is_gap)}`}
                            title={cell.is_gap ? t("quality.cellKnownGapTitle") : t("quality.cellCoverageTitle", { value: fmtPct(cell.coverage, 1) })}
                          >
                            <span>{fmtPct(cell.coverage, 0)}</span>
                            {cell.is_gap ? <span className="ml-2 text-[10px] font-medium text-[var(--color-fg)]">{t("common.knownGap")}</span> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScrollContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
