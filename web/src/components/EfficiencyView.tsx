import { useState } from "react";
import {
  useEfficiency,
  useEfficiencyFrontier,
  useEfficiencyMatrix,
  useEfficiencyQuality,
  useProjects,
} from "@/lib/api";
import { InfoBadge } from "@/components/InfoBadge";
import { PanelStatus } from "@/components/PanelStatus";
import { FrontierScatter } from "@/components/charts/FrontierScatter";
import { EfficiencyMatrix } from "@/components/charts/EfficiencyMatrix";
import { EfficiencyTable } from "@/components/EfficiencyTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/context";

export function EfficiencyView({
  project,
  onProjectChange,
}: {
  project: string | null;
  onProjectChange: (id: string | null) => void;
}) {
  const [subagentOnly, setSubagentOnly] = useState(false);
  const { t } = useI18n();
  const { data: projects, isError: projectsError } = useProjects();
  const { data: frontier, isError: frontierError } = useEfficiencyFrontier(project, subagentOnly);
  const { data: byModel, isError: byModelError } = useEfficiency("model", project, subagentOnly);
  const { data: byModelQuality, isError: byModelQualityError } = useEfficiencyQuality("model", project, subagentOnly);
  const { data: byAgent, isError: byAgentError } = useEfficiency("agent", project, subagentOnly);
  const { data: byAgentQuality, isError: byAgentQualityError } = useEfficiencyQuality("agent", project, subagentOnly);
  const { data: matrix, isError: matrixError } = useEfficiencyMatrix(project, subagentOnly);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-[var(--color-muted)]" htmlFor="efficiency-project">
          {t("common.project")}
        </label>
        <select
          id="efficiency-project"
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

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("efficiency.frontierTitle")}</CardTitle>
          <InfoBadge kind="leverage" />
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs text-[var(--color-muted)]">
            {t("efficiency.frontierHint")}
          </div>
          {frontierError ? <PanelStatus kind="error" /> : frontier ? <FrontierScatter rows={frontier} /> : <PanelStatus />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("efficiency.byModel")}</CardTitle>
          <InfoBadge kind="efficiency" />
        </CardHeader>
        <CardContent>
          {byModelError || byModelQualityError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : <EfficiencyTable rows={byModel} quality={byModelQuality} label={t("efficiency.byModelTableLabel")} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("efficiency.byAgent")}</CardTitle>
          <InfoBadge kind="efficiency" />
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs text-[var(--color-muted)]">
            {t("efficiency.agentHint")}
          </div>
          {byAgentError || byAgentQualityError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : <EfficiencyTable rows={byAgent} quality={byAgentQuality} label={t("efficiency.byAgentTableLabel")} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("efficiency.matrixTitle")}</CardTitle>
          <InfoBadge kind="efficiency" />
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs text-[var(--color-muted)]">
            {t("efficiency.matrixHint")}
          </div>
          {matrixError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : <EfficiencyMatrix rows={matrix} />}
        </CardContent>
      </Card>
    </div>
  );
}
