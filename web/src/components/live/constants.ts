import type { LiveHealth } from "@/lib/api";

export const HEALTH_BADGE_TONE: Record<LiveHealth, "good" | "warn" | "bad" | "neutral"> = {
  green: "good",
  yellow: "warn",
  red: "bad",
  idle: "neutral",
  done: "neutral",
};

export const RESOLVED_HEALTHS = new Set<LiveHealth>(["done", "idle"]);
