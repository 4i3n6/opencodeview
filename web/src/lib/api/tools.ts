import { useQuery } from "@tanstack/react-query";
import { apiQuery, get } from "./shared";

export const TOOL_METRIC_DURATION_BASIS_FIELD = "duration_quantile_basis";

export interface ToolMetricRow {
  readonly tool: string;
  readonly calls: number;
  readonly errors: number;
  readonly err_rate: number;
  readonly err_rate_lo?: number | null;
  readonly err_rate_hi?: number | null;
  readonly dur_p50_s: number | null;
  readonly dur_p95_s: number | null;
  readonly duration_quantile_basis?: "raw_samples" | "unavailable_monthly_rollups" | null;
}

export interface ToolErrorClassRow {
  readonly error_class: string;
  readonly n: number;
  readonly sample: string | null;
}

export function useTools(project?: string | null) {
  const query = apiQuery({ project: project ?? undefined });
  return useQuery({ queryKey: ["tools", project], queryFn: () => get<ToolMetricRow[]>(`/api/tools${query}`) });
}

export function useToolErrors(project?: string | null, tool?: string | null) {
  const query = apiQuery({ project: project ?? undefined, tool: tool ?? undefined });
  return useQuery({ queryKey: ["tool-errors", project, tool], queryFn: () => get<ToolErrorClassRow[]>(`/api/tools/errors${query}`) });
}
