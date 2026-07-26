import { useQuery } from "@tanstack/react-query";
import { apiQuery, get } from "./shared";

export type ConsumptionDimension = "model" | "agent" | "project" | "variant";

export interface ConsumptionRow {
  readonly key: string;
  readonly sessions: number;
  readonly msgs: number;
  readonly tokens_input: number;
  readonly tokens_output: number;
  readonly tokens_reasoning: number;
  readonly tokens_cache_read: number;
  readonly tokens_cache_write: number;
  readonly total: number;
}

export interface ConsumptionTimelineRow {
  readonly month: string;
  readonly tokens_input: number;
  readonly tokens_output: number;
  readonly tokens_reasoning: number;
  readonly tokens_cache_read: number;
  readonly tokens_cache_write: number;
  readonly total: number;
}

export interface ConsumptionSummary {
  readonly msgs: number;
  readonly sessions: number;
  readonly models: number;
  readonly agents: number;
  readonly tokens_input: number;
  readonly tokens_output: number;
  readonly tokens_reasoning: number;
  readonly tokens_cache_read: number;
  readonly tokens_cache_write: number;
  readonly total: number;
}

export function useConsumption(dimension: ConsumptionDimension, project?: string | null, subagent?: boolean) {
  const query = apiQuery({ dimension, project: project ?? undefined, subagent: subagent ? "1" : undefined });
  return useQuery({ queryKey: ["consumption", dimension, project, subagent], queryFn: () => get<ConsumptionRow[]>(`/api/consumption${query}`) });
}

export function consumptionTimelineQueryOptions(project?: string | null, subagent?: boolean) {
  const query = apiQuery({ project: project ?? undefined, subagent: subagent ? "1" : undefined });
  return { queryKey: ["consumption-timeline", project, subagent] as const, queryFn: () => get<ConsumptionTimelineRow[]>(`/api/consumption/timeline${query}`) };
}

export function useConsumptionTimeline(project?: string | null, subagent?: boolean) {
  return useQuery(consumptionTimelineQueryOptions(project, subagent));
}

export function consumptionSummaryQueryOptions(project?: string | null, subagent?: boolean) {
  const query = apiQuery({ project: project ?? undefined, subagent: subagent ? "1" : undefined });
  return { queryKey: ["consumption-summary", project, subagent] as const, queryFn: () => get<ConsumptionSummary>(`/api/consumption/summary${query}`) };
}

export function useConsumptionSummary(project?: string | null, subagent?: boolean) {
  return useQuery(consumptionSummaryQueryOptions(project, subagent));
}
