import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { EfficiencyQualityRow, EfficiencyRow } from "@/lib/api";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { PanelStatus } from "@/components/PanelStatus";
import { useI18n } from "@/i18n/context";
import { fmtDecimal, fmtInt, fmtM, fmtPct } from "@/lib/utils";

interface MergedRow {
  key: string;
  sessions: number;
  tokens_per_session: number;
  tokens_p50: number | null;
  tokens_p90: number | null;
  tokens_per_msg: number;
  reasoning_ratio: number;
  cache_reuse_rate: number;
  output_input_ratio: number;
  tool_error_rate: number | null;
  apply_patch_precision: number | null;
}

type SortKey = keyof Omit<MergedRow, "key">;

export function EfficiencyTable({
  rows,
  quality,
  label,
}: {
  rows: EfficiencyRow[] | undefined;
  quality: EfficiencyQualityRow[] | undefined;
  readonly label: string;
}) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState<SortKey>("tokens_per_session");
  const [sortDesc, setSortDesc] = useState(true);

  const merged = useMemo<MergedRow[]>(() => {
    const qByKey = new Map((quality ?? []).map((q) => [q.key, q]));
    return (rows ?? []).map((r) => {
      const q = qByKey.get(r.key);
      return {
        key: r.key,
        sessions: r.sessions,
        tokens_per_session: r.tokens_per_session,
        tokens_p50: r.tokens_p50 ?? null,
        tokens_p90: r.tokens_p90 ?? null,
        tokens_per_msg: r.tokens_per_msg,
        reasoning_ratio: r.reasoning_ratio,
        cache_reuse_rate: r.cache_reuse_rate,
        output_input_ratio: r.output_input_ratio,
        tool_error_rate: q?.tool_error_rate ?? null,
        apply_patch_precision: q?.apply_patch_precision ?? null,
      };
    });
  }, [rows, quality]);

  const sorted = useMemo(() => {
    const copy = [...merged];
    copy.sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDesc ? bv - av : av - bv;
    });
    return copy;
  }, [merged, sortKey, sortDesc]);

  const columns: { key: SortKey; label: string; fmt: (v: number | null) => string }[] = [
    { key: "sessions", label: t("efficiency.sessions"), fmt: (v) => fmtInt(v) },
    { key: "tokens_per_session", label: t("efficiency.tokensPerSession"), fmt: (v) => fmtM(v) },
    { key: "tokens_per_msg", label: t("efficiency.tokensPerMessage"), fmt: (v) => fmtM(v) },
    { key: "reasoning_ratio", label: t("efficiency.reasoningRatio"), fmt: (v) => fmtPct(v) },
    { key: "cache_reuse_rate", label: t("efficiency.cacheReuse"), fmt: (v) => fmtPct(v) },
    { key: "output_input_ratio", label: t("efficiency.outputInput"), fmt: (v) => fmtDecimal(v, 2) },
    { key: "tool_error_rate", label: t("common.errorRate"), fmt: (v) => fmtPct(v) },
    { key: "apply_patch_precision", label: t("common.patchPrecision"), fmt: (v) => fmtPct(v) },
  ];

  if (rows == null) return <PanelStatus minHeightClassName="min-h-24" />;
  if (sorted.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.emptyScope")}</div>;

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

  return (
    <Table label={label}>
      <THead>
        <TR>
          <TH>{t("common.key")}</TH>
          {columns.map((c) => (
            <TH key={c.key} className="text-right select-none" aria-sort={ariaSort(c.key)}>
              <button type="button" className="inline-flex items-center justify-end gap-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" onClick={() => onSort(c.key)}>
                {c.label}
                <SortIcon k={c.key} />
              </button>
            </TH>
          ))}
        </TR>
      </THead>
      <tbody>
        {sorted.map((r) => (
          <TR key={r.key}>
            <TD className="font-medium">{r.key}</TD>
            {columns.map((c) => (
              <TD key={c.key} className="text-right tabular-nums">
                {c.fmt(r[c.key])}
                {c.key === "tokens_per_session" && (r.tokens_p50 != null || r.tokens_p90 != null) ? (
                  <div className="text-[10px] font-normal text-[var(--color-muted)]">
                    p50 {fmtM(r.tokens_p50)} · p90 {fmtM(r.tokens_p90)}
                  </div>
                ) : null}
              </TD>
            ))}
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
