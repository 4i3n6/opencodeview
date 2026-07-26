import { useQuery } from "@tanstack/react-query";
import { get } from "./shared";

export interface SessionDetailData {
  readonly session_id: string;
  readonly project_id: string | null;
  readonly slug: string | null;
  readonly title: string | null;
  readonly parent_id: string | null;
  readonly is_subagent: number;
  readonly agent: string | null;
  readonly model: string | null;
  readonly time_created: number;
  readonly time_updated: number | null;
  readonly tokens_input: number;
  readonly tokens_output: number;
  readonly tokens_reasoning: number;
  readonly tokens_cache_read: number;
  readonly tokens_cache_write: number;
  readonly cost: number | null;
  readonly summary_additions: number;
  readonly summary_deletions: number;
  readonly summary_files: number;
  readonly tool_calls: number;
  readonly tool_errors: number;
  readonly tool_error_rate: number | null;
  readonly patch_count: number;
  readonly apply_patch_ok: number;
  readonly apply_patch_err: number;
  readonly compaction_count: number;
  readonly reasoning_parts: number;
  readonly text_parts: number;
  readonly file_parts: number;
  readonly msg_count: number | null;
  readonly assistant_msgs: number | null;
  readonly trunc_length: number | null;
  readonly avg_latency_s: number | null;
  readonly active_min: number | null;
  readonly bursts: number | null;
  readonly max_gap_h: number | null;
  readonly flags: string;
  readonly dominant_model_id: string | null;
  readonly dominant_provider_id: string | null;
  readonly dominant_variant: string | null;
  readonly spawn_depth: number | null;
  readonly live_fallback?: boolean;
}

export interface TranscriptTokens {
  readonly input?: number | null;
  readonly output?: number | null;
  readonly reasoning?: number | null;
  readonly cache?: { readonly read?: number | null; readonly write?: number | null } | null;
  readonly total?: number | null;
}

export type TranscriptPart =
  | { readonly type: "text"; readonly text: string; readonly synthetic?: boolean; readonly truncated?: boolean; readonly full_len?: number }
  | { readonly type: "reasoning"; readonly text: string; readonly truncated?: boolean; readonly full_len?: number }
  | {
      readonly type: "tool";
      readonly tool: string;
      readonly callID?: string | null;
      readonly status?: string | null;
      readonly title?: string | null;
      readonly duration_s?: number | null;
      readonly input?: unknown;
      readonly output?: unknown;
      readonly error?: unknown;
      readonly input_truncated?: boolean;
      readonly output_truncated?: boolean;
      readonly error_truncated?: boolean;
    }
  | { readonly type: "patch"; readonly hash?: string | null; readonly files: string[] }
  | { readonly type: "file"; readonly path?: string | null; readonly mime?: string | null }
  | { readonly type: "step-finish"; readonly reason?: string | null; readonly cost?: number | null; readonly tokens?: TranscriptTokens | null }
  | { readonly type: "step-start" }
  | { readonly type: "compaction" }
  | { readonly type: "agent" }
  | {
      readonly type: "subtask";
      readonly agent?: string | null;
      readonly description?: string | null;
      readonly command?: string | null;
      readonly model?: { readonly providerID?: string | null; readonly modelID?: string | null } | null;
      readonly prompt?: string | null;
      readonly prompt_truncated?: boolean;
      readonly prompt_full_len?: number;
    };

export interface TranscriptMessage {
  readonly id: string;
  readonly role: string;
  readonly model_id?: string | null;
  readonly provider_id?: string | null;
  readonly variant?: string | null;
  readonly agent?: string | null;
  readonly tokens?: TranscriptTokens | null;
  readonly time_created: number;
  readonly time_completed?: number | null;
  readonly finish?: string | null;
  readonly cost?: number | null;
  readonly parts: TranscriptPart[];
}

export interface TranscriptResponse {
  readonly total_messages: number;
  readonly offset: number;
  readonly limit: number;
  readonly messages: TranscriptMessage[];
}

export function useSession(id: string | null) {
  return useQuery({
    queryKey: ["session", id],
    queryFn: () => get<SessionDetailData>(`/api/session/${encodeURIComponent(id ?? "")}`),
    enabled: !!id,
  });
}

export function useSessionTranscript(id: string | null, offset: number, limit = 40) {
  return useQuery({
    queryKey: ["session-transcript", id, offset, limit],
    queryFn: () => get<TranscriptResponse>(`/api/session/${encodeURIComponent(id ?? "")}/transcript?offset=${offset}&limit=${limit}`),
    enabled: !!id,
  });
}
