import { useMemo } from "react";
import type { HygieneRow } from "@/lib/api";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n/context";
import { fmtDurationS } from "@/lib/utils";

function HygieneTable({
  rows,
  emptyLabel,
  label,
  onOpenSession,
}: {
  rows: HygieneRow[];
  emptyLabel: string;
  label: string;
  onOpenSession?: ((id: string) => void) | undefined;
}) {
  const { t } = useI18n();
  if (rows.length === 0) return <div className="text-sm text-[var(--color-muted)]">{emptyLabel}</div>;

  return (
    <Table label={label}>
      <THead>
        <TR>
          <TH>{t("orchestration.title")}</TH>
          <TH>subagent_type</TH>
          <TH>{t("common.status")}</TH>
          <TH className="text-right">{t("common.duration")}</TH>
        </TR>
      </THead>
      <tbody>
        {rows.map((r) => (
          <TR key={r.child_session_id}>
            <TD className="max-w-[420px] truncate font-medium" title={r.title ?? r.child_session_id}>
              {onOpenSession ? (
                <button type="button" className="max-w-full truncate rounded text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" onClick={() => onOpenSession(r.child_session_id)} aria-label={`${t("common.openSession")}: ${r.title || r.child_session_id}`}>
                  {r.title || r.child_session_id}
                </button>
              ) : (
                r.title || r.child_session_id
              )}
            </TD>
            <TD>{r.requested_subagent_type ?? "—"}</TD>
            <TD>
              <Badge tone="warn">{r.status}</Badge>
            </TD>
            <TD className="text-right tabular-nums">{fmtDurationS(r.duration_s)}</TD>
          </TR>
        ))}
      </tbody>
    </Table>
  );
}

export function HygienePanel({
  rows,
  onOpenSession,
}: {
  rows: HygieneRow[] | undefined;
  onOpenSession?: ((id: string) => void) | undefined;
}) {
  const { t } = useI18n();
  const { instantFail, zombie } = useMemo(() => {
    const instantFail = (rows ?? []).filter((r) => r.status === "error");
    const zombie = (rows ?? []).filter((r) => r.status === "running");
    return { instantFail, zombie };
  }, [rows]);

  if (rows == null) return <div className="text-sm text-[var(--color-muted)]">{t("common.loading")}</div>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <div className="mb-2 text-sm font-medium">{t("orchestration.instantFailures", { count: instantFail.length })}</div>
        <div className="mb-2 text-xs text-[var(--color-muted)]">{t("orchestration.instantFailuresHint")}</div>
        <HygieneTable rows={instantFail} emptyLabel={t("orchestration.noInstantFailures")} label={t("orchestration.instantFailuresTableLabel")} onOpenSession={onOpenSession} />
      </div>
      <div>
        <div className="mb-2 text-sm font-medium">{t("orchestration.zombies", { count: zombie.length })}</div>
        <div className="mb-2 text-xs text-[var(--color-muted)]">{t("orchestration.zombiesHint")}</div>
        <HygieneTable rows={zombie} emptyLabel={t("orchestration.noZombies")} label={t("orchestration.zombiesTableLabel")} onOpenSession={onOpenSession} />
      </div>
    </div>
  );
}
