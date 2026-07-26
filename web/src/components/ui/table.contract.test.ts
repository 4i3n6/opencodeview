import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const SOURCE = new URL("./table.tsx", import.meta.url);

describe("TableScrollContainer overflow affordance contract", () => {
  test("shows the scroll hint only when horizontal overflow is detected", async () => {
    const source = await readFile(SOURCE, "utf8");

    expect(source).toContain("ResizeObserver");
    expect(source).toContain("scrollWidth > el.clientWidth");
    expect(source).toContain("readonly label?: string");
    expect(source).toContain("const accessibleLabel = label ??");
    expect(source).toContain('t("common.tableLabel")');
    expect(source).toContain("tabIndex={overflowsX ? 0 : undefined}");
    expect(source).toContain("aria-label={overflowsX ? accessibleLabel : undefined}");
    expect(source).not.toContain('label={t("common.tableScrollHint")}');
    expect(source).toContain("{overflowsX ? (");
  });
});
