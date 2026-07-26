import { describe, expect, test } from "bun:test";
import { LIVE_REFRESH_INTERVAL_MS, TOOL_METRIC_DURATION_BASIS_FIELD } from "./api";

describe("api frontend contracts", () => {
  test("tool metrics consume the backend duration quantile basis field", () => {
    expect(TOOL_METRIC_DURATION_BASIS_FIELD).toBe("duration_quantile_basis");
  });

  test("live polling exposes one canonical refresh interval", () => {
    expect(LIVE_REFRESH_INTERVAL_MS).toBe(10_000);
  });
});
