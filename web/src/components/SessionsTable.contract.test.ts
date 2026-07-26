import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const SOURCE = new URL("./SessionsTable.tsx", import.meta.url);

describe("SessionsTable presentation contract", () => {
  test("labels active time correctly, formats numbers, and distinguishes loading from empty", async () => {
    const source = await readFile(SOURCE, "utf8");

    expect(source).toContain('t("common.activeTime")');
    expect(source).not.toContain('t("live.health.green")');
    expect(source).toContain("text-right tabular-nums");
    expect(source).toContain("fmtInt(s.compaction_count)");
    expect(source).toContain("rows: SessionRow[] | undefined");
    expect(source).toContain('t("common.loading")');
    expect(source).toContain("rows: SessionRow[] | undefined");
    expect(source).toContain('t("common.loading")');
    expect(source).toContain('t("common.noSessions")');
  });
});
