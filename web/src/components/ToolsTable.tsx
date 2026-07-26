import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ToolMetricRow } from "@/lib/api";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtDurationS, fmtInt, fmtPct, wilsonInterval } from "@/lib/utils";
import { useI18n } from "@/i18n/context";

interface Row extends ToolMetricRow {
  lo: number;
  hi: number;
}

type SortKey = "calls" | "err_rate" | "hi" | "dur_p95_s";

export function ToolsTable({ rows }: { rows: ToolMetricRow[] | undefined }) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("hi");
  const [sortDesc, setSortDesc] = useState(true);

  const withCi = useMemo<Row[]>(() => {
    return (rows ?? []).map((r) => {
      const ci = r.err_rate_lo != null && r.err_rate_hi != null ? { lo: r.err_rate_lo, hi: r.err_rate_hi } : wilsonInterval(r.errors, r.calls);
      return { ...r, lo: ci.lo, hi: ci.hi };
    });
  }, [rows]);

  const sorted = useMemo(() => {
    const copy = [...withCi];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDesc ? bv - av : av - bv;
    });
    return copy;
  }, [withCi, sortKey, sortDesc]);

  if (rows == null) return <div className="text-sm text-[var(--color-muted)]">{t("common.loading")}</div>;
  if (sorted.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("tools.empty")}</div>;

  function onSort(k: SortKey) {
    if (k === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(k);
      setSortDesc(true);
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (k !== sortKey) return <ArrowUpDown size={12} className="opacity-40" />;
    return sortDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />;
  }

  function ariaSort(k: SortKey): "ascending" | "descending" | "none" {
    if (k !== sortKey) return "none";
    return sortDesc ? "descending" : "ascending";
  }

  function SortHeader({ sort, children }: { sort: SortKey; children: string }) {
    return (
      <TH className="text-right select-none" aria-sort={ariaSort(sort)}>
        <button type="button" className="inline-flex items-center justify-end gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" onClick={() => onSort(sort)}>
          {children} <SortIcon k={sort} />
        </button>
      </TH>
    );
  }

  function formatDurationCell(row: Row): string {
    if (row.duration_quantile_basis === "unavailable_monthly_rollups") return t("tools.durationUnavailableMonthly");
    if (row.dur_p95_s == null) return t("tools.durationUnavailable");
    return fmtDurationS(row.dur_p95_s);
  }

  return (
    <Table label={t("tools.healthTableLabel")}>
      <THead>
        <TR>
          <TH>{t("tools.tool")}</TH>
          <SortHeader sort="calls">{t("common.calls")}</SortHeader>
          <SortHeader sort="err_rate">{t("common.errorRate")}</SortHeader>
          <SortHeader sort="hi">{t("tools.wilsonCi")}</SortHeader>
          <SortHeader sort="dur_p95_s">{t("tools.durationP95")}</SortHeader>
        </TR>
      </THead>
      <tbody>
        {sorted.map((r) => (
          <TR key={r.tool}>
            <TD className="font-medium">{r.tool}</TD>
            <TD className="text-right tabular-nums">{fmtInt(r.calls)}</TD>
            <TD className="text-right tabular-nums">{fmtPct(r.err_rate)}</TD>
            <TD className="text-right tabular-nums text-xs text-[var(--color-muted)]">
              [{fmtPct(r.lo, 1)} – {fmtPct(r.hi, 1)}]
            </TD>
            <TD className="text-right tabular-nums">{formatDurationCell(r)}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
