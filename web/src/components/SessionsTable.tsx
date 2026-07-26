import type { SessionRow } from "@/lib/api";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FlagBadge } from "@/components/FlagBadge";
import { useI18n } from "@/i18n/context";
import { parseFlags } from "@/lib/flags";
import { fmtHours, fmtInt, fmtM, fmtPct, parseModel } from "@/lib/utils";

function errTone(rate: number, calls: number): "good" | "warn" | "bad" | "neutral" {
  if (calls < 5) return "neutral";
  if (rate > 0.3) return "bad";
  if (rate > 0.1) return "warn";
  return "good";
}

export function SessionsTable({
  rows,
  onOpenSession,
}: {
  rows: SessionRow[] | undefined;
  onOpenSession?: (id: string) => void;
}) {
  const { t } = useI18n();
  if (rows == null) {
    return (
      <div className="text-sm text-[var(--color-muted)]" role="status" aria-live="polite">
        {t("common.loading")}
      </div>
    );
  }
  if (rows.length === 0)
    return <div className="text-sm text-[var(--color-muted)]">{t("common.noSessions")}</div>;

  return (
    <Table label={t("project.sessionsTableLabel")}>
      <THead>
        <TR>
          <TH>{t("common.session")}</TH>
          <TH>{t("common.model")}</TH>
          <TH className="text-right">{t("common.tokens")}</TH>
          <TH className="text-right">{t("common.tools")}</TH>
          <TH className="text-right">{t("common.error")}</TH>
          <TH className="text-right">{t("common.patchOk")}</TH>
          <TH className="text-right">{t("common.compactions")}</TH>
          <TH className="text-right">{t("common.activeTime")}</TH>
          <TH>{t("common.flags")}</TH>
        </TR>
      </THead>
      <tbody>
        {rows.map((s) => {
          const flags = parseFlags(s.flags);
          const model = parseModel(s.model);
          const apTotal = s.apply_patch_ok + s.apply_patch_err;
          return (
            <TR key={s.session_id}>
              <TD className="max-w-[320px]">
                <div className="flex items-center gap-2">
                  {s.is_subagent ? <Badge tone="purple">{t("common.sub")}</Badge> : <Badge tone="accent">{t("common.main")}</Badge>}
                  {onOpenSession ? (
                    <button type="button" className="min-w-0 truncate rounded text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" title={s.title} onClick={() => onOpenSession(s.session_id)} aria-label={`${t("common.openSession")}: ${s.title || s.session_id}`}>
                      {s.title || "—"}
                    </button>
                  ) : (
                    <span className="truncate" title={s.title}>{s.title || "—"}</span>
                  )}
                </div>
              </TD>
              <TD className="text-[var(--color-muted)]">
                {model ? (
                  <span title={model.provider ?? ""}>
                    {model.id}
                    {model.variant ? <span className="opacity-60"> ·{model.variant}</span> : null}
                  </span>
                ) : (
                  "—"
                )}
              </TD>
              <TD className="text-right tabular-nums">{fmtM(s.tokens)}</TD>
              <TD className="text-right tabular-nums">{fmtInt(s.tool_calls)}</TD>
              <TD className="text-right tabular-nums">
                <Badge tone={errTone(s.tool_error_rate, s.tool_calls)}>
                  {fmtPct(s.tool_error_rate)}
                </Badge>
              </TD>
              <TD className="text-right tabular-nums">
                {apTotal > 0 ? `${fmtInt(s.apply_patch_ok)}/${fmtInt(apTotal)}` : "—"}
              </TD>
              <TD className="text-right tabular-nums">{s.compaction_count > 0 ? fmtInt(s.compaction_count) : "—"}</TD>
              <TD className="text-right tabular-nums">
                {fmtHours(s.active_min)}
              </TD>
              <TD>
                <div className="flex flex-wrap gap-1">
                  {flags.map((f) => (
                    <FlagBadge key={f} flag={f} />
                  ))}
                </div>
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}
