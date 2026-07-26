import type { ToolErrorClassRow } from "@/lib/api";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { useI18n } from "@/i18n/context";
import { fmtInt } from "@/lib/utils";

export function ToolErrorClasses({ rows }: { rows: ToolErrorClassRow[] | undefined }) {
  const { t } = useI18n();
  if (rows == null) return <div className="text-sm text-[var(--color-muted)]">{t("common.loading")}</div>;
  if (rows.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("tools.errorClassesEmpty")}</div>;

  const sorted = [...rows].sort((a, b) => b.n - a.n);

  return (
    <Table label={t("tools.errorClassesTableLabel")}>
      <THead>
        <TR>
          <TH>{t("tools.errorClass")}</TH>
          <TH className="text-right">{t("tools.occurrences")}</TH>
          <TH>{t("common.example")}</TH>
        </TR>
      </THead>
      <tbody>
        {sorted.map((r, i) => (
          <TR key={`${r.error_class}-${i}`}>
            <TD className="font-medium">{r.error_class}</TD>
            <TD className="text-right tabular-nums">{fmtInt(r.n)}</TD>
            <TD className="max-w-[420px] truncate text-xs text-[var(--color-muted)]" title={r.sample ?? undefined}>
              {r.sample ?? "—"}
            </TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}
