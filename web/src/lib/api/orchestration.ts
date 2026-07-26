import { useQuery } from "@tanstack/react-query";
import { apiQuery, get } from "./shared";

export interface HygieneRow {
  readonly parent_session_id: string;
  readonly child_session_id: string;
  readonly status: string;
  readonly duration_s: number | null;
  readonly requested_subagent_type: string | null;
  readonly title: string | null;
}

export interface OrchestrationDepthRow {
  readonly spawn_depth: number;
  readonly sessions: number;
  readonly tokens: number;
  readonly active_min: number | null;
}

export interface OrchestrationCategoryRow {
  readonly category: string | null;
  readonly count: number;
}

export interface OrchestrationSummary {
  readonly primary_count: number;
  readonly subagent_count: number;
  readonly total_delegations: number;
  readonly by_spawn_depth: OrchestrationDepthRow[];
  readonly by_category: OrchestrationCategoryRow[];
}

export type OrchestrationRoutingDimension = "category" | "subagent_type" | "model";

export interface OrchestrationRoutingRow {
  readonly key: string | null;
  readonly count: number;
  readonly child_tokens: number | null;
  readonly avg_duration_s: number | null;
  readonly run_in_background_count: number;
  readonly child_adds?: number | null;
  readonly child_patch_ok?: number | null;
  readonly roi?: number | null;
}

export interface OrchestrationTopRow {
  readonly session_id: string;
  readonly title: string | null;
  readonly agent: string | null;
  readonly dominant_model_id: string | null;
  readonly descendants: number;
  readonly tokens_subtree: number;
  readonly active_min_subtree: number | null;
}

export interface OrchestrationTreeNode {
  readonly session_id: string;
  readonly title: string | null;
  readonly agent: string | null;
  readonly dominant_model_id: string | null;
  readonly tokens: number;
  readonly active_min: number | null;
  readonly spawn_depth: number;
  readonly parent_id: string | null;
  readonly depth: number;
}

export function useOrchestrationHygiene(project?: string | null) {
  const query = apiQuery({ project: project ?? undefined });
  return useQuery({ queryKey: ["orchestration-hygiene", project], queryFn: () => get<HygieneRow[]>(`/api/orchestration/hygiene${query}`) });
}

export function useOrchestrationSummary(project?: string | null) {
  const query = apiQuery({ project: project ?? undefined });
  return useQuery({ queryKey: ["orchestration-summary", project], queryFn: () => get<OrchestrationSummary>(`/api/orchestration/summary${query}`) });
}

export function useOrchestrationRouting(by: OrchestrationRoutingDimension, project?: string | null) {
  const query = apiQuery({ by, project: project ?? undefined });
  return useQuery({ queryKey: ["orchestration-routing", by, project], queryFn: () => get<OrchestrationRoutingRow[]>(`/api/orchestration/routing${query}`) });
}

export function useOrchestrationTop(project?: string | null) {
  const query = apiQuery({ project: project ?? undefined });
  return useQuery({ queryKey: ["orchestration-top", project], queryFn: () => get<OrchestrationTopRow[]>(`/api/orchestration/top${query}`) });
}

export function useOrchestrationTree(session: string | null) {
  return useQuery({
    queryKey: ["orchestration-tree", session],
    queryFn: () => get<OrchestrationTreeNode[]>(`/api/orchestration/tree?session=${encodeURIComponent(session ?? "")}`),
    enabled: !!session,
  });
}
