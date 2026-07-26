import { useState } from "react";
import { useConsumption, useConsumptionSummary, useConsumptionTimeline, useProjects } from "@/lib/api";
import { KpiCard } from "@/components/KpiCard";
import { InfoBadge } from "@/components/InfoBadge";
import { PanelStatus } from "@/components/PanelStatus";
import { CompositionChart } from "@/components/charts/CompositionChart";
import { StackedDimensionChart } from "@/components/charts/StackedDimensionChart";
import { TimelineChart } from "@/components/charts/TimelineChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { fmtInt, fmtM, fmtPct } from "@/lib/utils";

export function ConsumptionView({
  project,
  onProjectChange,
}: {
  project: string | null;
  onProjectChange: (id: string | null) => void;
}) {
  const [subagentOnly, setSubagentOnly] = useState(false);
  const { t } = useI18n();
  const { data: projects, isError: projectsError } = useProjects();
  const { data: summary, isError: summaryError } = useConsumptionSummary(project, subagentOnly);
  const { data: timeline, isError: timelineError } = useConsumptionTimeline(project, subagentOnly);
  const { data: byModel, isError: byModelError } = useConsumption("model", project, subagentOnly);
  const { data: byAgent, isError: byAgentError } = useConsumption("agent", project, subagentOnly);

  const total = summary?.total ?? 0;
  const reasoningPct = summary && total > 0 ? summary.tokens_reasoning / total : null;
  const cacheBase = summary ? summary.tokens_input + summary.tokens_cache_read : 0;
  const cacheReusePct = summary && cacheBase > 0 ? summary.tokens_cache_read / cacheBase : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-[var(--color-muted)]" htmlFor="consumption-project">
          {t("common.project")}
        </label>
        <select
          id="consumption-project"
          className="h-8 rounded-md border bg-[var(--color-panel)] px-2 text-sm text-[var(--color-fg)]"
          value={project ?? ""}
          onChange={(e) => onProjectChange(e.target.value || null)}
        >
          <option value="">{t("common.allProjects")}</option>
          {(projects ?? []).map((p) => (
            <option key={p.project_id} value={p.project_id}>
              {p.slug}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Button variant={subagentOnly ? "solid" : "outline"} aria-pressed={subagentOnly} onClick={() => setSubagentOnly((v) => !v)}>
          {t("consumption.onlySubagents")}
        </Button>
      </div>
      {projectsError ? <PanelStatus kind="error" minHeightClassName="min-h-16" /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard title={t("overview.totalTokens")} value={summary ? fmtM(total) : "—"} badge="fact" />
        <KpiCard
          title={t("consumption.reasoningPct")}
          value={reasoningPct != null ? fmtPct(reasoningPct) : "—"}
          badge="efficiency"
          sub={t("consumption.reasoningSub")}
        />
        <KpiCard
          title={t("consumption.cacheReusePct")}
          value={cacheReusePct != null ? fmtPct(cacheReusePct) : "—"}
          badge="efficiency"
          sub={t("consumption.cacheSub")}
        />
        <KpiCard title={t("consumption.models")} value={summary ? fmtInt(summary.models) : "—"} badge="fact" />
        <KpiCard title={t("consumption.agents")} value={summary ? fmtInt(summary.agents) : "—"} badge="fact" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>{t("consumption.tokenComposition")}</CardTitle>
            <InfoBadge kind="fact" />
          </CardHeader>
          <CardContent>
            {summaryError ? (
              <PanelStatus kind="error" />
            ) : summary ? (
              <CompositionChart
                input={summary.tokens_input}
                output={summary.tokens_output}
                reasoning={summary.tokens_reasoning}
                cache={summary.tokens_cache_read}
              />
            ) : (
              <PanelStatus />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>{t("consumption.monthlyTimeline")}</CardTitle>
            <InfoBadge kind="fact" />
          </CardHeader>
          <CardContent>
            <div className="mb-2 flex items-center gap-2 text-xs text-[var(--color-muted)]">
              <InfoBadge kind="quality" />
              <span>{t("consumption.knownGapHint")}</span>
            </div>
            {timelineError ? <PanelStatus kind="error" /> : timeline ? <TimelineChart rows={timeline} /> : <PanelStatus />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>{t("consumption.byModel")}</CardTitle>
            <InfoBadge kind="fact" />
          </CardHeader>
          <CardContent>{byModelError ? <PanelStatus kind="error" /> : byModel ? <StackedDimensionChart rows={byModel} title={t("consumption.byModel")} /> : <PanelStatus />}</CardContent>
        </Card>
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>{t("consumption.byAgent")}</CardTitle>
            <InfoBadge kind="fact" />
          </CardHeader>
          <CardContent>{byAgentError ? <PanelStatus kind="error" /> : byAgent ? <StackedDimensionChart rows={byAgent} title={t("consumption.byAgent")} /> : <PanelStatus />}</CardContent>
        </Card>
      </div>
    </div>
  );
}
