import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  consumptionSummaryQueryOptions,
  consumptionTimelineQueryOptions,
  efficiencyFrontierQueryOptions,
  efficiencyMatrixQueryOptions,
  efficiencyQualityQueryOptions,
} from "./api";

type ContractQueryOptions = {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<unknown>;
};

async function collectUrlFor(options: ContractQueryOptions): Promise<string> {
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    urls.push(String(input));
    return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await client.fetchQuery(options);
  } finally {
    globalThis.fetch = originalFetch;
  }
  expect(urls.length).toBe(1);
  return urls[0] ?? "";
}

describe("subagent-only cohort query contracts", () => {
  test("consumption summary and timeline include subagent in query keys and endpoints", async () => {
    const summary = consumptionSummaryQueryOptions("project-a", true);
    const timeline = consumptionTimelineQueryOptions("project-a", true);

    expect(summary.queryKey).toEqual(["consumption-summary", "project-a", true]);
    expect(timeline.queryKey).toEqual(["consumption-timeline", "project-a", true]);
    expect(await collectUrlFor(summary)).toBe("/api/consumption/summary?project=project-a&subagent=1");
    expect(await collectUrlFor(timeline)).toBe("/api/consumption/timeline?project=project-a&subagent=1");
  });

  test("efficiency quality, frontier and matrix include subagent in query keys and endpoints", async () => {
    const quality = efficiencyQualityQueryOptions("model", "project-a", true);
    const frontier = efficiencyFrontierQueryOptions("project-a", true);
    const matrix = efficiencyMatrixQueryOptions("project-a", true);

    expect(quality.queryKey).toEqual(["efficiency-quality", "model", "project-a", true]);
    expect(frontier.queryKey).toEqual(["efficiency-frontier", "project-a", true]);
    expect(matrix.queryKey).toEqual(["efficiency-matrix", "project-a", true]);
    expect(await collectUrlFor(quality)).toBe("/api/efficiency/quality?dimension=model&project=project-a&subagent=1");
    expect(await collectUrlFor(frontier)).toBe("/api/efficiency/frontier?project=project-a&subagent=1");
    expect(await collectUrlFor(matrix)).toBe("/api/efficiency/matrix?project=project-a&subagent=1");
  });
});
