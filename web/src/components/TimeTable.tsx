import type { TimeRow } from "@/lib/api";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { PanelStatus } from "@/components/PanelStatus";
import { useI18n } from "@/i18n/context";
import { fmtDurationS, fmtHours, fmtInt, fmtM } from "@/lib/utils";

function fmtLatency(s: number | null): string {
  return fmtDurationS(s);
}

export function TimeTable({ rows, label }: { rows: TimeRow[] | undefined; readonly label: string }) {
  const { t } = useI18n();
  if (rows == null) return <PanelStatus minHeightClassName="min-h-24" />;
  if (rows.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.emptyScope")}</div>;

  const sorted = [...rows].sort((a, b) => (b.active_min ?? 0) - (a.active_min ?? 0));

  return (
    <Table label={label}>
      <THead>
        <TR>
          <TH>{t("common.key")}</TH>
          <TH className="text-right">{t("common.sessions")}</TH>
          <TH className="text-right">{t("common.activeTime")}</TH>
          <TH className="text-right">{t("common.averageLatency")}</TH>
          <TH className="text-right">{t("common.tokens")}</TH>
          <TH className="text-right">{t("common.activeTokensPerMinute")}</TH>
        </TR>
      </THead>
      <tbody>
        {sorted.map((r) => (
          <TR key={r.key}>
            <TD className="font-medium">{r.key || t("common.unknownParenthesized")}</TD>
            <TD className="text-right tabular-nums">{fmtInt(r.sessions)}</TD>
            <TD className="text-right tabular-nums">{fmtHours(r.active_min)}</TD>
            <TD className="text-right tabular-nums">
              {fmtLatency(r.avg_latency_s)}
              {r.latency_p50 != null || r.latency_p95 != null ? (
                <div className="text-[10px] font-normal text-[var(--color-muted)]">
                  p50 {fmtLatency(r.latency_p50 ?? null)} · p95 {fmtLatency(r.latency_p95 ?? null)}
                </div>
              ) : null}
            </TD>
            <TD className="text-right tabular-nums">{fmtM(r.tokens)}</TD>
            <TD className="text-right tabular-nums">{r.tokens_per_active_min != null ? fmtM(r.tokens_per_active_min) : "—"}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
