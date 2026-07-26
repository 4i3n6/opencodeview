import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const SOURCE = new URL("./ProjectOverview.tsx", import.meta.url);

describe("ProjectOverview presentation contract", () => {
  test("formats KPI integers through fmtInt instead of raw numbers", async () => {
    const source = await readFile(SOURCE, "utf8");

    expect(source).toContain("value={fmtInt(o.sessions)}");
    expect(source).toContain("value={fmtInt(o.compactions)}");
    expect(source).toContain("count: fmtInt(o.subagents)");
    expect(source).not.toContain("value={o.sessions}");
    expect(source).not.toContain("value={o.compactions}");
  });
});
