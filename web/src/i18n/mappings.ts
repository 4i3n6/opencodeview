import type { LiveHealth, OrchestrationRoutingDimension, TimeDimension, TranscriptPart } from "../lib/api";
import type { FlagTone } from "../lib/flags";
import type { MessageKey } from "./catalogs";

export const TAB_IDS = ["overview", "live", "consumption", "efficiency", "orchestration", "quality", "tools"] as const;
export type TabId = (typeof TAB_IDS)[number];

export const TAB_LABEL_KEYS = {
  overview: "tab.overview",
  live: "tab.live",
  consumption: "tab.consumption",
  efficiency: "tab.efficiency",
  orchestration: "tab.orchestration",
  quality: "tab.quality",
  tools: "tab.tools",
} as const satisfies Record<TabId, MessageKey>;

export const INFO_KIND_LABEL_KEYS = {
  fact: "badge.fact",
  efficiency: "badge.efficiency",
  quality: "badge.quality",
  waste: "badge.waste",
  leverage: "badge.leverage",
} as const satisfies Record<string, MessageKey>;

export const ORCHESTRATION_ROUTING_DIMENSION_LABEL_KEYS = {
  category: "orchestration.dimension.category",
  subagent_type: "orchestration.dimension.subagent_type",
  model: "common.model",
} as const satisfies Record<OrchestrationRoutingDimension, MessageKey>;

export const TIME_DIMENSION_LABEL_KEYS = {
  agent: "common.agent",
  model: "common.model",
} as const satisfies Record<Extract<TimeDimension, "agent" | "model">, MessageKey>;

export const ROUTING_CHART_TOOLTIP_LABEL_KEYS = {
  background: "routing.tooltip.background",
  roi: "routing.tooltip.roi",
  additionsPerThousandTokens: "routing.tooltip.additionsPerThousandTokens",
  uncategorized: "routing.uncategorized",
} as const satisfies Record<string, MessageKey>;

export const LIVE_HEALTH_LABEL_KEYS = {
  green: "live.health.green",
  yellow: "live.health.yellow",
  red: "live.health.red",
  idle: "live.health.idle",
  done: "live.health.done",
} as const satisfies Record<LiveHealth, MessageKey>;

export const TERMINAL_EVENT_LABEL_KEYS = {
  poll_timeout: "terminal.poll_timeout",
  max_turns: "terminal.max_turns",
  aborted_by_user: "terminal.aborted_by_user",
  terminal_error: "terminal.terminal_error",
} as const satisfies Record<string, MessageKey>;

export const TOOL_STATUS_LABEL_KEYS = {
  completed: "toolStatus.completed",
  success: "toolStatus.success",
  ok: "toolStatus.ok",
  error: "toolStatus.error",
  failed: "toolStatus.failed",
  failure: "toolStatus.failure",
  running: "toolStatus.running",
  pending: "toolStatus.pending",
  unknown: "toolStatus.unknown",
} as const satisfies Record<string, MessageKey>;

export type KnownToolStatus = keyof typeof TOOL_STATUS_LABEL_KEYS;

export function isKnownToolStatus(status: string): status is KnownToolStatus {
  return Object.hasOwn(TOOL_STATUS_LABEL_KEYS, status);
}

export const TRANSCRIPT_PART_LABEL_KEYS = {
  text: "transcript.part.text",
  reasoning: "transcript.part.reasoning",
  tool: "transcript.part.tool",
  patch: "transcript.part.patch",
  file: "transcript.part.file",
  "step-finish": "transcript.part.step-finish",
  "step-start": "transcript.part.step-start",
  compaction: "transcript.part.compaction",
  agent: "transcript.part.agent",
  subtask: "transcript.part.subtask",
} as const satisfies Record<TranscriptPart["type"], MessageKey>;

export type KnownFlag =
  | "tool_failure_loop"
  | "patch_waste"
  | "context_pressure"
  | "truncation"
  | "omo_metadata_bug"
  | "security_anomaly"
  | "low_yield_high_cost"
  | "data_quality_gap";

export const KNOWN_FLAG_KEYS = {
  tool_failure_loop: {
    label: "flag.tool_failure_loop.label",
    description: "flag.tool_failure_loop.description",
    tone: "bad",
  },
  patch_waste: { label: "flag.patch_waste.label", description: "flag.patch_waste.description", tone: "bad" },
  context_pressure: { label: "flag.context_pressure.label", description: "flag.context_pressure.description", tone: "warn" },
  truncation: { label: "flag.truncation.label", description: "flag.truncation.description", tone: "warn" },
  omo_metadata_bug: { label: "flag.omo_metadata_bug.label", description: "flag.omo_metadata_bug.description", tone: "purple" },
  security_anomaly: { label: "flag.security_anomaly.label", description: "flag.security_anomaly.description", tone: "bad" },
  low_yield_high_cost: { label: "flag.low_yield_high_cost.label", description: "flag.low_yield_high_cost.description", tone: "warn" },
  data_quality_gap: { label: "flag.data_quality_gap.label", description: "flag.data_quality_gap.description", tone: "neutral" },
} as const satisfies Record<KnownFlag, { readonly label: MessageKey; readonly description: MessageKey; readonly tone: FlagTone }>;

export function isKnownFlag(flag: string): flag is KnownFlag {
  return Object.hasOwn(KNOWN_FLAG_KEYS, flag);
}
