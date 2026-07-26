import { useState } from "react";
import { useTools, useToolErrors, useProjects } from "@/lib/api";
import { InfoBadge } from "@/components/InfoBadge";
import { PanelStatus } from "@/components/PanelStatus";
import { ToolsTable } from "@/components/ToolsTable";
import { ToolErrorClasses } from "@/components/ToolErrorClasses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/context";

export function ToolsView({
  project,
  onProjectChange,
}: {
  project: string | null;
  onProjectChange: (id: string | null) => void;
}) {
  const { t } = useI18n();
  const [errorTool, setErrorTool] = useState<string | null>(null);
  const { data: projects, isError: projectsError } = useProjects();
  const { data: tools, isError: toolsError } = useTools(project);
  const { data: errors, isError: errorsError } = useToolErrors(project, errorTool);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-[var(--color-muted)]" htmlFor="tools-project">
          {t("common.project")}
        </label>
        <select
          id="tools-project"
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

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("tools.healthTitle")}</CardTitle>
          <InfoBadge kind="quality" />
        </CardHeader>
        <CardContent>
          <div className="mb-2 text-xs text-[var(--color-muted)]">
            {t("tools.healthHint")}
          </div>
          {toolsError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : <ToolsTable rows={tools} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between gap-2">
          <CardTitle>{t("tools.errorClassesTitle")}</CardTitle>
          <InfoBadge kind="waste" />
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-sm text-[var(--color-muted)]" htmlFor="tools-error-tool">
              {t("tools.tool")}
            </label>
            <select
              id="tools-error-tool"
              className="h-8 rounded-md border bg-[var(--color-panel)] px-2 text-sm text-[var(--color-fg)]"
              value={errorTool ?? ""}
              onChange={(e) => setErrorTool(e.target.value || null)}
            >
              <option value="">{t("tools.allTools")}</option>
              {(tools ?? []).map((t) => (
                <option key={t.tool} value={t.tool}>
                  {t.tool}
                </option>
              ))}
            </select>
          </div>
          {errorsError ? <PanelStatus kind="error" minHeightClassName="min-h-24" /> : <ToolErrorClasses rows={errors} />}
        </CardContent>
      </Card>
    </div>
  );
}
