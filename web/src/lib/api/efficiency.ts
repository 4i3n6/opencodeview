import { useQuery } from "@tanstack/react-query";
import { apiQuery, get } from "./shared";

export type EfficiencyDimension = "model" | "agent";

export interface EfficiencyRow {
  readonly key: string;
  readonly sessions: number;
  readonly msgs: number;
  readonly total_tokens: number;
  readonly tokens_per_session: number;
  readonly tokens_p50?: number | null;
  readonly tokens_p90?: number | null;
  readonly latency_p50?: number | null;
  readonly latency_p95?: number | null;
  readonly tokens_per_msg: number;
  readonly reasoning_ratio: number;
  readonly cache_reuse_rate: number;
  readonly output_input_ratio: number;
}

export interface EfficiencyQualityRow {
  readonly key: string;
  readonly sessions: number;
  readonly tokens_per_session: number;
  readonly tool_error_rate: number | null;
  readonly tool_error_rate_lo?: number | null;
  readonly tool_error_rate_hi?: number | null;
  readonly apply_patch_precision: number | null;
  readonly apply_patch_precision_lo?: number | null;
  readonly apply_patch_precision_hi?: number | null;
  readonly rank_lo?: number | null;
  readonly tokens_per_diff_line: number | null;
  readonly diff_sessions: number;
  readonly active_min_avg: number | null;
  readonly tokens_p50?: number | null;
  readonly tokens_p90?: number | null;
  readonly latency_p50?: number | null;
  readonly latency_p95?: number | null;
}

export interface EfficiencyMatrixRow {
  readonly model_id: string;
  readonly agent: string;
  readonly sessions: number;
  readonly msgs: number;
  readonly total_tokens: number;
  readonly tokens_per_session: number;
  readonly reasoning_ratio: number;
  readonly cache_reuse_rate: number;
}

export interface EfficiencyFrontierRow {
  readonly model: string;
  readonly sessions: number;
  readonly tokens_per_session: number;
  readonly tool_error_rate: number | null;
  readonly tool_error_rate_lo?: number | null;
  readonly tool_error_rate_hi?: number | null;
  readonly apply_patch_precision: number | null;
  readonly apply_patch_precision_lo?: number | null;
  readonly apply_patch_precision_hi?: number | null;
  readonly rank_lo?: number | null;
}

export function useEfficiency(dimension: EfficiencyDimension, project?: string | null, subagent?: boolean) {
  const query = apiQuery({ dimension, project: project ?? undefined, subagent: subagent ? "1" : undefined });
  return useQuery({ queryKey: ["efficiency", dimension, project, subagent], queryFn: () => get<EfficiencyRow[]>(`/api/efficiency${query}`) });
}

export function efficiencyQualityQueryOptions(dimension: EfficiencyDimension, project?: string | null, subagent?: boolean) {
  const query = apiQuery({ dimension, project: project ?? undefined, subagent: subagent ? "1" : undefined });
  return { queryKey: ["efficiency-quality", dimension, project, subagent] as const, queryFn: () => get<EfficiencyQualityRow[]>(`/api/efficiency/quality${query}`) };
}

export function useEfficiencyQuality(dimension: EfficiencyDimension, project?: string | null, subagent?: boolean) {
  return useQuery(efficiencyQualityQueryOptions(dimension, project, subagent));
}

export function efficiencyMatrixQueryOptions(project?: string | null, subagent?: boolean) {
  const query = apiQuery({ project: project ?? undefined, subagent: subagent ? "1" : undefined });
  return { queryKey: ["efficiency-matrix", project, subagent] as const, queryFn: () => get<EfficiencyMatrixRow[]>(`/api/efficiency/matrix${query}`) };
}

export function useEfficiencyMatrix(project?: string | null, subagent?: boolean) {
  return useQuery(efficiencyMatrixQueryOptions(project, subagent));
}

export function efficiencyFrontierQueryOptions(project?: string | null, subagent?: boolean) {
  const query = apiQuery({ project: project ?? undefined, subagent: subagent ? "1" : undefined });
  return { queryKey: ["efficiency-frontier", project, subagent] as const, queryFn: () => get<EfficiencyFrontierRow[]>(`/api/efficiency/frontier${query}`) };
}

export function useEfficiencyFrontier(project?: string | null, subagent?: boolean) {
  return useQuery(efficiencyFrontierQueryOptions(project, subagent));
}
