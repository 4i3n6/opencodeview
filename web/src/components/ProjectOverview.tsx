import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useProjectOverview, useProjectSessions } from "@/lib/api";
import { KpiCard } from "@/components/KpiCard";
import { FlagBadge } from "@/components/FlagBadge";
import { FlagsChart } from "@/components/charts/FlagsChart";
import { PanelStatus } from "@/components/PanelStatus";
import { SessionsTable } from "@/components/SessionsTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { fmtHours, fmtInt, fmtM, fmtPct } from "@/lib/utils";

export function ProjectOverview({
  id,
  onBack,
  onOpenSession,
}: {
  id: string;
  onBack: () => void;
  onOpenSession: (id: string) => void;
}) {
  const { t } = useI18n();
  const { data: o, isLoading, isError: overviewError } = useProjectOverview(id);
  const [flaggedOnly, setFlaggedOnly] = useState(true);
  const [order, setOrder] = useState<"tokens" | "active">("tokens");
  const { data: sessions, isError: sessionsError } = useProjectSessions(id, flaggedOnly, order);

  if (overviewError)
    return <PanelStatus kind="error" minHeightClassName="min-h-24" />;

  if (isLoading || !o)
    return <div className="p-6 text-sm text-[var(--color-muted)]">{t("project.loading")}</div>;

  const errRate = o.tool_calls > 0 ? o.tool_errors / o.tool_calls : 0;
  const apTotal = o.apply_patch_ok + o.apply_patch_err;
  const apPrec = apTotal > 0 ? o.apply_patch_ok / apTotal : null;
  const flagEntries = Object.entries(o.flags).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" /> {t("project.backToProjects")}
        </Button>
        <h2 className="text-lg font-semibold">{o.slug}</h2>
        <span className="text-xs text-[var(--color-muted)]">{o.project_id}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard title={t("common.sessions")} value={fmtInt(o.sessions)} sub={t("overview.subagentCount", { count: fmtInt(o.subagents) })} />
        <KpiCard title={t("common.tokens")} value={fmtM(o.tokens)} />
        <KpiCard title={t("common.activeTime")} value={fmtHours(o.active_min)} sub={t("project.clusterSub")} />
        <KpiCard
          title={t("common.toolErrorRate")}
          value={fmtPct(errRate)}
          tone={errRate > 0.05 ? "warn" : "good"}
          sub={`${fmtInt(o.tool_calls)} ${t("common.calls")}`}
        />
        <KpiCard
          title={t("common.patchPrecision")}
          value={apPrec != null ? fmtPct(apPrec) : "—"}
          tone={apPrec != null && apPrec < 0.8 ? "warn" : "good"}
          sub={apTotal > 0 ? t("project.patchSub", { ok: fmtInt(o.apply_patch_ok), total: fmtInt(apTotal) }) : t("project.noApplyPatch")}
        />
        <KpiCard title={t("common.compactions")} value={fmtInt(o.compactions)} tone={o.compactions > 50 ? "warn" : "fg"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("project.flags")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FlagsChart flags={o.flags} title={t("project.flags")} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("project.summary")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1">
              {flagEntries.length ? (
                flagEntries.map(([f, n]) => <FlagBadge key={f} flag={f} count={n} />)
              ) : (
                <span className="text-sm text-[var(--color-muted)]">{t("project.noFlags")}</span>
              )}
            </div>
            <div className="text-sm text-[var(--color-muted)]">
              {t("project.additions")}: <span className="text-[var(--color-fg)]">{fmtM(o.additions)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{t("project.sessionsTitle")}</span>
        <div className="flex-1" />
        <Button variant={flaggedOnly ? "solid" : "outline"} aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly((v) => !v)}>
          {t("project.onlyFlagged")}
        </Button>
        <Button
          variant={order === "tokens" ? "solid" : "outline"}
          aria-pressed={order === "tokens"}
          onClick={() => setOrder("tokens")}
        >
          {t("project.byTokens")}
        </Button>
        <Button
          variant={order === "active" ? "solid" : "outline"}
          aria-pressed={order === "active"}
          onClick={() => setOrder("active")}
        >
          {t("project.byActiveTime")}
        </Button>
      </div>
      {sessionsError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : <SessionsTable rows={sessions} onOpenSession={onOpenSession} />}
    </div>
  );
}
