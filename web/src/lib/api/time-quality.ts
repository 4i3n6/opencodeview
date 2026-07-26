import { useQuery } from "@tanstack/react-query";
import { apiQuery, get } from "./shared";

export type TimeDimension = "agent" | "model" | "project";

export interface TimeRow {
  readonly key: string;
  readonly sessions: number;
  readonly active_min: number | null;
  readonly avg_latency_s: number | null;
  readonly tokens_p50?: number | null;
  readonly tokens_p90?: number | null;
  readonly latency_p50?: number | null;
  readonly latency_p95?: number | null;
  readonly tokens: number;
  readonly tokens_per_active_min: number | null;
}

export interface DataQualityRow {
  readonly field: string;
  readonly month: string;
  readonly coverage: number;
  readonly is_gap: number;
}

export function useDataQuality() {
  return useQuery({ queryKey: ["data-quality"], queryFn: () => get<DataQualityRow[]>("/api/data-quality") });
}

export function useTime(dimension: TimeDimension, project?: string | null) {
  const query = apiQuery({ dimension, project: project ?? undefined });
  return useQuery({ queryKey: ["time", dimension, project], queryFn: () => get<TimeRow[]>(`/api/time${query}`) });
}
