import { useMemo, useState } from "react";
import {
  useOrchestrationHygiene,
  useOrchestrationRouting,
  useOrchestrationSummary,
  useOrchestrationTop,
  useOrchestrationTree,
  useProjects,
  useTime,
  type OrchestrationRoutingDimension,
  type TimeDimension,
} from "@/lib/api";
import { KpiCard } from "@/components/KpiCard";
import { InfoBadge } from "@/components/InfoBadge";
import { PanelStatus } from "@/components/PanelStatus";
import { RoutingChart } from "@/components/charts/RoutingChart";
import { DepthChart } from "@/components/charts/DepthChart";
import { DelegationTree } from "@/components/DelegationTree";
import { HygienePanel } from "@/components/HygienePanel";
import { TimeTable } from "@/components/TimeTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";
import { ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS, TIME_DIMENSION_LABEL_KEYS } from "@/i18n/mappings";
import { fmtDecimal, fmtDurationS, fmtInt, fmtM, fmtPct } from "@/lib/utils";

const ROUTING_DIMENSIONS: { key: OrchestrationRoutingDimension; labelKey: (typeof ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS)[OrchestrationRoutingDimension] }[] = [
  { key: "category", labelKey: ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS.category },
  { key: "subagent_type", labelKey: ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS.subagent_type },
  { key: "model", labelKey: ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS.model },
];

const TIME_DIMENSIONS: { key: Extract<TimeDimension, "agent" | "model">; labelKey: (typeof TIME_DIMENSION_LABEL_KEYS)[Extract<TimeDimension, "agent" | "model">] }[] = [
  { key: "agent", labelKey: TIME_DIMENSION_LABEL_KEYS.agent },
  { key: "model", labelKey: TIME_DIMENSION_LABEL_KEYS.model },
];

export function OrchestrationView({
  project,
  onProjectChange,
  onOpenSession,
}: {
  project: string | null;
  onProjectChange: (id: string | null) => void;
  onOpenSession?: ((id: string) => void) | undefined;
}) {
  const { t } = useI18n();
  const [routingBy, setRoutingBy] = useState<OrchestrationRoutingDimension>("category");
  const [timeDim, setTimeDim] = useState<TimeDimension>("agent");
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data: projects, isError: projectsError } = useProjects();
  const { data: summary, isError: summaryError } = useOrchestrationSummary(project);
  const { data: routingByCategory, isError: routingByCategoryError } = useOrchestrationRouting("category", project);
  const { data: routing, isError: routingError } = useOrchestrationRouting(routingBy, project);
  const { data: top, isError: topError } = useOrchestrationTop(project);
  const { data: tree, isError: treeError } = useOrchestrationTree(selectedSession);
  const { data: time, isError: timeError } = useTime(timeDim, project);
  const { data: hygiene, isError: hygieneError } = useOrchestrationHygiene(project);

  const maxDepth = useMemo(() => {
    if (!summary?.by_spawn_depth?.length) return null;
    return Math.max(...summary.by_spawn_depth.map((d) => d.spawn_depth));
  }, [summary]);

  const subagentTokenPct = useMemo(() => {
    if (!summary?.by_spawn_depth?.length) return null;
    const total = summary.by_spawn_depth.reduce((s, d) => s + d.tokens, 0);
    const sub = summary.by_spawn_depth.filter((d) => d.spawn_depth > 0).reduce((s, d) => s + d.tokens, 0);
    return total > 0 ? sub / total : null;
  }, [summary]);

  const avgDelegationDuration = useMemo(() => {
    if (!routingByCategory?.length) return null;
    let num = 0;
    let den = 0;
    for (const r of routingByCategory) {
      if (r.avg_duration_s == null) continue;
      num += r.avg_duration_s * r.count;
      den += r.count;
    }
    return den > 0 ? num / den : null;
  }, [routingByCategory]);

  const tokensPerMinInsight = useMemo(() => {
    if (!summary?.by_spawn_depth?.length) return null;
    const primary = summary.by_spawn_depth.find((d) => d.spawn_depth === 0);
    const sub = summary.by_spawn_depth.filter((d) => d.spawn_depth > 0);
    if (!primary || !primary.active_min || sub.length === 0) return null;
    const primaryRate = primary.tokens / primary.active_min;
    const subTokens = sub.reduce((s, d) => s + d.tokens, 0);
    const subActive = sub.reduce((s, d) => s + (d.active_min ?? 0), 0);
    if (subActive <= 0) return null;
    const subRate = subTokens / subActive;
    return { primaryRate, subRate, factor: primaryRate > 0 ? subRate / primaryRate : null };
  }, [summary]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-[var(--color-muted)]" htmlFor="orchestration-project">
          {t("common.project")}
        </label>
        <select
          id="orchestration-project"
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
      </div>
      {projectsError ? <PanelStatus kind="error" minHeightClassName="min-h-16" /> : null}
      {summaryError || routingByCategoryError ? <PanelStatus kind="error" minHeightClassName="min-h-16" /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard title={t("orchestration.totalDelegations")} value={summary ? fmtInt(summary.total_delegations) : "—"} badge="fact" />
        <KpiCard title={t("orchestration.maxDepth")} value={maxDepth != null ? fmtInt(maxDepth) : "—"} badge="fact" />
        <KpiCard
          title={t("orchestration.subagentTokenPct")}
          value={subagentTokenPct != null ? fmtPct(subagentTokenPct) : "—"}
          badge="efficiency"
          sub={t("orchestration.subagentTokenSub")}
        />
        <KpiCard
          title={t("orchestration.avgDelegationDuration")}
          value={fmtDurationS(avgDelegationDuration)}
          badge="fact"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>{t("orchestration.routingTitle")}</CardTitle>
            <InfoBadge kind="leverage" />
          </CardHeader>
          <CardContent>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {ROUTING_DIMENSIONS.map((d) => (
                <Button key={d.key} variant={routingBy === d.key ? "solid" : "outline"} aria-pressed={routingBy === d.key} onClick={() => setRoutingBy(d.key)}>
                  {t(d.labelKey)}
                </Button>
              ))}
            </div>
            {routingError ? <PanelStatus kind="error" /> : routing ? <RoutingChart rows={routing} /> : <PanelStatus />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between gap-2">
            <CardTitle>{t("orchestration.depthTitle")}</CardTitle>
            <InfoBadge kind="fact" />
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-xs text-[var(--color-muted)]">
              {t("orchestration.depthHint")}
            </div>
            {summaryError ? <PanelStatus kind="error" /> : summary ? <DepthChart rows={summary.by_spawn_depth} /> : <PanelStatus />}
            {tokensPerMinInsight?.factor != null ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <InfoBadge kind="leverage" />
                <span>
                  {t("orchestration.tokenRateInsight", {
                    factor: fmtDecimal(tokensPerMinInsight.factor),
                    subRate: fmtM(tokensPerMinInsight.subRate),
                    primaryRate: fmtM(tokensPerMinInsight.primaryRate),
                  })}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("orchestration.hygieneTitle")}</CardTitle>
          <InfoBadge kind="waste" />
        </CardHeader>
        <CardContent>
          {hygieneError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : <HygienePanel rows={hygiene} onOpenSession={onOpenSession} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("orchestration.treeTitle")}</CardTitle>
          <InfoBadge kind="fact" />
        </CardHeader>
        <CardContent>
          {topError || treeError ? (
            <PanelStatus kind="error" minHeightClassName="min-h-24" />
          ) : (
            <DelegationTree
              top={top}
              selected={selectedSession}
              onSelect={setSelectedSession}
              tree={tree}
              onOpenSession={onOpenSession}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{timeDim === "agent" ? t("orchestration.timeByAgent") : t("orchestration.timeByModel")}</CardTitle>
          <InfoBadge kind="efficiency" />
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TIME_DIMENSIONS.map((d) => (
              <Button key={d.key} variant={timeDim === d.key ? "solid" : "outline"} aria-pressed={timeDim === d.key} onClick={() => setTimeDim(d.key)}>
                {t(d.labelKey)}
              </Button>
            ))}
          </div>
          {timeError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : <TimeTable rows={time} label={t("orchestration.timeTableLabel")} />}
        </CardContent>
      </Card>
    </div>
  );
}
