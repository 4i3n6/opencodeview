import { useQuery } from "@tanstack/react-query";
import { get, type FlagMap } from "./shared";

export interface Meta {
  readonly cache: string;
  readonly projects: number;
  readonly sessions: number;
  readonly scanned_at: number;
}

export interface GlobalStats {
  readonly sessions: number;
  readonly subagents: number;
  readonly tokens: number;
  readonly active_min: number;
  readonly tool_calls: number;
  readonly tool_errors: number;
  readonly apply_patch_ok: number;
  readonly apply_patch_err: number;
  readonly compactions: number;
  readonly flags: FlagMap;
}

export interface ProjectRow {
  readonly project_id: string;
  readonly slug: string;
  readonly sessions: number;
  readonly tokens_total: number;
  readonly scanned_at: number;
  readonly flagged: number;
  readonly active_min: number | null;
}

export interface ProjectOverview {
  readonly project_id: string;
  readonly slug: string;
  readonly sessions: number;
  readonly subagents: number;
  readonly tokens: number;
  readonly active_min: number | null;
  readonly tool_calls: number;
  readonly tool_errors: number;
  readonly apply_patch_ok: number;
  readonly apply_patch_err: number;
  readonly compactions: number;
  readonly additions: number;
  readonly flags: FlagMap;
}

export interface SessionRow {
  readonly session_id: string;
  readonly title: string;
  readonly is_subagent: number;
  readonly agent: string | null;
  readonly model: string | null;
  readonly time_created: number;
  readonly tokens: number;
  readonly tokens_reasoning: number;
  readonly tool_calls: number;
  readonly tool_errors: number;
  readonly tool_error_rate: number;
  readonly patch_count: number;
  readonly apply_patch_ok: number;
  readonly apply_patch_err: number;
  readonly compaction_count: number;
  readonly summary_additions: number;
  readonly active_min: number | null;
  readonly bursts: number | null;
  readonly max_gap_h: number | null;
  readonly avg_latency_s: number | null;
  readonly flags: string;
}

export function useMeta() {
  return useQuery({ queryKey: ["meta"], queryFn: () => get<Meta>("/api/meta") });
}

export function useGlobal() {
  return useQuery({ queryKey: ["global"], queryFn: () => get<GlobalStats>("/api/global") });
}

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => get<ProjectRow[]>("/api/projects") });
}

export function useProjectOverview(id: string | null) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: () => get<ProjectOverview>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useProjectSessions(id: string | null, flaggedOnly: boolean, order: "tokens" | "active") {
  return useQuery({
    queryKey: ["sessions", id, flaggedOnly, order],
    queryFn: () =>
      get<SessionRow[]>(
        `/api/projects/${id}/sessions?limit=200${flaggedOnly ? "&flagged=1" : ""}${order === "active" ? "&order=active" : ""}`,
      ),
    enabled: !!id,
  });
}
