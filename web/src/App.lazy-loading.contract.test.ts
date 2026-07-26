import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const APP_SOURCE = new URL("./App.tsx", import.meta.url);

const HEAVY_MODULES = [
  "@/components/ConsumptionView",
  "@/components/EfficiencyView",
  "@/components/OrchestrationView",
  "@/components/DataQualityView",
  "@/components/ToolsView",
  "@/components/LiveView",
  "@/components/ProjectOverview",
  "@/components/SessionDetail",
  "@/components/charts/TokensChart",
  "@/components/charts/FlagsChart",
] as const;

describe("App entry bundle contract", () => {
  test("lazy-loads heavy dashboard views and overview charts", async () => {
    const source = await readFile(APP_SOURCE, "utf8");

    for (const modulePath of HEAVY_MODULES) {
      expect(source).not.toContain(`from "${modulePath}"`);
      expect(source).toContain(`import("${modulePath}")`);
    }
  });
});
