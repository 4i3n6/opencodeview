import { lazy, Suspense, useEffect, useState } from "react";
import { Activity, Boxes, Cpu, TriangleAlert } from "lucide-react";
import { useGlobal, useMeta, useProjects } from "@/lib/api";
import { KpiCard } from "@/components/KpiCard";
import { PanelStatus } from "@/components/PanelStatus";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtHours, fmtInt, fmtM, fmtPct } from "@/lib/utils";
import { useI18n } from "@/i18n/context";
import { SUPPORTED_LOCALES } from "@/i18n/catalogs";
import { TAB_IDS, TAB_LABEL_KEYS, type TabId } from "@/i18n/mappings";

type Tab = TabId;

const FlagsChart = lazy(() => import("@/components/charts/FlagsChart").then((module) => ({ default: module.FlagsChart })));
const TokensChart = lazy(() => import("@/components/charts/TokensChart").then((module) => ({ default: module.TokensChart })));
const ProjectOverview = lazy(() => import("@/components/ProjectOverview").then((module) => ({ default: module.ProjectOverview })));
const ConsumptionView = lazy(() => import("@/components/ConsumptionView").then((module) => ({ default: module.ConsumptionView })));
const EfficiencyView = lazy(() => import("@/components/EfficiencyView").then((module) => ({ default: module.EfficiencyView })));
const OrchestrationView = lazy(() => import("@/components/OrchestrationView").then((module) => ({ default: module.OrchestrationView })));
const DataQualityView = lazy(() => import("@/components/DataQualityView").then((module) => ({ default: module.DataQualityView })));
const ToolsView = lazy(() => import("@/components/ToolsView").then((module) => ({ default: module.ToolsView })));
const LiveView = lazy(() => import("@/components/LiveView").then((module) => ({ default: module.LiveView })));
const SessionDetail = lazy(() => import("@/components/SessionDetail").then((module) => ({ default: module.SessionDetail })));

function LoadingFallback() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="h-24 animate-pulse rounded-xl border bg-[var(--color-panel)]" />
        <div className="h-24 animate-pulse rounded-xl border bg-[var(--color-panel)]" />
        <div className="h-24 animate-pulse rounded-xl border bg-[var(--color-panel)]" />
        <div className="h-24 animate-pulse rounded-xl border bg-[var(--color-panel)]" />
      </div>
      <div className="h-56 animate-pulse rounded-xl border bg-[var(--color-panel)]" />
      <span className="sr-only">
        <LoadingLabel />
      </span>
    </div>
  );
}

function LoadingLabel() {
  const { t } = useI18n();
  return <>{t("common.loading")}</>;
}

function useUrlParam(param: string, fallback: string | null = null): [string | null, (v: string | null) => void] {
  const [value, setValue] = useState<string | null>(() => new URLSearchParams(location.search).get(param) ?? fallback);
  useEffect(() => {
    const url = new URL(location.href);
    if (value) url.searchParams.set(param, value);
    else url.searchParams.delete(param);
    history.replaceState(null, "", url);
  }, [param, value]);
  return [value, setValue];
}

function useHashProject(): [string | null, (id: string | null) => void] {
  return useUrlParam("p");
}

function useSessionParam(): [string | null, (id: string | null) => void] {
  return useUrlParam("session");
}

const TABS: readonly Tab[] = TAB_IDS;

function isTab(value: string | null): value is Tab {
  return value != null && TABS.some((tab) => tab === value);
}

function useTab(): [Tab, (tab: Tab) => void] {
  const [raw, setRaw] = useUrlParam("tab", "overview");
  const tab: Tab = isTab(raw) ? raw : "overview";
  return [tab, (t: Tab) => setRaw(t === "overview" ? null : t)];
}

function GlobalDashboard({ onSelect }: { onSelect: (id: string) => void }) {
  const { t } = useI18n();
  const { data: g, isError: globalError } = useGlobal();
  const { data: projects, isError: projectsError } = useProjects();

  const errRate = g && g.tool_calls > 0 ? g.tool_errors / g.tool_calls : 0;
  const apTotal = g ? g.apply_patch_ok + g.apply_patch_err : 0;
  const apPrec = g && apTotal > 0 ? g.apply_patch_ok / apTotal : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard title={t("overview.sessions")} value={g ? fmtInt(g.sessions) : "—"} sub={g ? t("overview.subagentCount", { count: fmtInt(g.subagents) }) : ""} />
        <KpiCard title={t("common.tokens")} value={g ? fmtM(g.tokens) : "—"} />
        <KpiCard title={t("common.activeTime")} value={g ? fmtHours(g.active_min) : "—"} />
        <KpiCard title={t("common.toolCalls")} value={g ? fmtInt(g.tool_calls) : "—"} sub={t("overview.toolErrorSub", { rate: fmtPct(errRate) })} tone={errRate > 0.05 ? "warn" : "good"} />
        <KpiCard title={t("common.patchPrecision")} value={apPrec != null ? fmtPct(apPrec) : "—"} tone="good" />
        <KpiCard title={t("common.compactions")} value={g ? fmtInt(g.compactions) : "—"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("overview.tokensByProject")}</CardTitle>
          </CardHeader>
          <CardContent>
            {projectsError ? (
              <PanelStatus kind="error" />
            ) : projects ? (
              <Suspense fallback={<PanelStatus />}>
                <TokensChart projects={projects} />
              </Suspense>
            ) : (
              <PanelStatus />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("overview.flagsInCorpus")}</CardTitle>
          </CardHeader>
          <CardContent>
            {globalError ? (
              <PanelStatus kind="error" />
            ) : g ? (
              <Suspense fallback={<PanelStatus />}>
                <FlagsChart flags={g.flags} />
              </Suspense>
            ) : (
              <PanelStatus />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("overview.projects")}</CardTitle>
        </CardHeader>
        <CardContent>
          {projectsError ? (
            <PanelStatus kind="error" minHeightClassName="min-h-24" />
          ) : (
            <Table label={t("overview.projectsTableLabel")}>
              <THead>
                <TR>
                  <TH>{t("common.project")}</TH>
                  <TH className="text-right">{t("common.sessions")}</TH>
                  <TH className="text-right">{t("common.tokens")}</TH>
                  <TH className="text-right">{t("common.activeTime")}</TH>
                  <TH className="text-right">{t("overview.flagged")}</TH>
                </TR>
              </THead>
              <tbody>
                {(projects ?? []).map((p) => (
                  <TR key={p.project_id}>
                    <TD className="font-medium">
                      <button type="button" className="rounded text-left underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]" onClick={() => onSelect(p.project_id)} aria-label={`${t("common.openProject")}: ${p.slug}`}>
                        {p.slug}
                      </button>
                    </TD>
                    <TD className="text-right tabular-nums">{fmtInt(p.sessions)}</TD>
                    <TD className="text-right tabular-nums">{fmtM(p.tokens_total)}</TD>
                    <TD className="text-right tabular-nums">{fmtHours(p.active_min)}</TD>
                    <TD className="text-right tabular-nums">{p.flagged > 0 ? <Badge tone="warn">{fmtInt(p.flagged)}</Badge> : "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const { data: meta } = useMeta();
  const [projectId, setProjectId] = useHashProject();
  const [tab, setTab] = useTab();
  const [sessionId, setSessionId] = useSessionParam();

  if (sessionId) {
    return (
      <div className="mx-auto max-w-[1400px] p-4 md:p-6">
        <Suspense fallback={<LoadingFallback />}>
          <SessionDetail id={sessionId} onBack={() => setSessionId(null)} onOpenSession={setSessionId} />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] overflow-x-hidden p-4 md:p-6">
      <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--color-accent)] focus:px-3 focus:py-2 focus:text-[var(--color-bg)]" href="#main-content">{t("app.skipToContent")}</a>
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Activity className="text-[var(--color-muted)]" size={22} aria-hidden="true" />
          <span className="text-xl font-semibold">{t("app.title")}</span>
        </div>
        <nav aria-label={t("app.navigation")} className="flex max-w-full items-center gap-1 overflow-x-auto rounded-md border bg-[var(--color-panel)] p-0.5 [scrollbar-gutter:stable]">
          {TABS.map((item) => (
            <Button key={item} variant={tab === item ? "solid" : "ghost"} onClick={() => setTab(item)} aria-current={tab === item ? "page" : undefined}>
              {t(TAB_LABEL_KEYS[item])}
            </Button>
          ))}
        </nav>
        <div className="flex-1" />
        {meta ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <Boxes size={14} aria-hidden="true" /> {fmtInt(meta.projects)} {t("common.projects")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Cpu size={14} aria-hidden="true" /> {fmtInt(meta.sessions)} {t("common.sessions")}
            </span>
            <span className="inline-flex items-center gap-1">
              <TriangleAlert size={14} aria-hidden="true" /> {t("app.readOnly")}
            </span>
          </div>
        ) : null}
        <label className="sr-only" htmlFor="locale-selector">{t("app.locale")}</label>
        <select id="locale-selector" className="h-8 rounded-md border bg-[var(--color-panel)] px-2 text-sm text-[var(--color-fg)]" value={locale} onChange={(event) => setLocale(event.target.value === "pt-BR" ? "pt-BR" : "en-US")}>
          {SUPPORTED_LOCALES.map((item) => (
            <option key={item} value={item}>{t(item === "pt-BR" ? "app.locale.pt-BR" : "app.locale.en-US")}</option>
          ))}
        </select>
      </header>

      <main id="main-content">
        <Suspense fallback={<LoadingFallback />}>
          {tab === "consumption" ? (
            <ConsumptionView project={projectId} onProjectChange={setProjectId} />
          ) : tab === "efficiency" ? (
            <EfficiencyView project={projectId} onProjectChange={setProjectId} />
          ) : tab === "live" ? (
            <LiveView onOpenSession={setSessionId} />
          ) : tab === "orchestration" ? (
            <OrchestrationView project={projectId} onProjectChange={setProjectId} onOpenSession={setSessionId} />
          ) : tab === "quality" ? (
            <DataQualityView />
          ) : tab === "tools" ? (
            <ToolsView project={projectId} onProjectChange={setProjectId} />
          ) : projectId ? (
            <ProjectOverview id={projectId} onBack={() => setProjectId(null)} onOpenSession={setSessionId} />
          ) : (
            <GlobalDashboard onSelect={setProjectId} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
