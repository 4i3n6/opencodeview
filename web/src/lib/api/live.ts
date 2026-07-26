import { useQuery } from "@tanstack/react-query";
import { get } from "./shared";

export type LiveHealth = "green" | "yellow" | "red" | "idle" | "done";

export const LIVE_REFRESH_INTERVAL_MS = 10_000;

export interface LiveNode {
  readonly session_id: string;
  readonly project_id: string;
  readonly project_slug: string;
  readonly parent_id: string | null;
  readonly title: string | null;
  readonly agent: string | null;
  readonly model: string | null;
  readonly time_created: number;
  readonly time_updated: number;
  readonly tokens: number;
  readonly tool_calls: number;
  readonly tool_errors: number;
  readonly last_tool_name: string | null;
  readonly last_tool_title: string | null;
  readonly last_tool_at: number | null;
  readonly last_text_snippet: string | null;
  readonly last_text_at: number | null;
  readonly is_complete: boolean;
  readonly log_status: string | null;
  readonly log_elapsed_s: number | null;
  readonly log_inactive_s: number | null;
  readonly log_tool_calls: number | null;
  readonly log_last_seen_at: number | null;
  readonly terminal_event: string | null;
  readonly last_real_activity_at: number;
  readonly health: LiveHealth;
}

export interface LiveResponse {
  readonly generated_at: number;
  readonly since_min: number;
  readonly nodes: LiveNode[];
}

export function useLive(sinceMin = 180) {
  return useQuery({
    queryKey: ["live", sinceMin],
    queryFn: () => get<LiveResponse>(`/api/live?since_min=${sinceMin}`),
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}
