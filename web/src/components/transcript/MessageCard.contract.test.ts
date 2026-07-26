import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const SOURCE = new URL("./MessageCard.tsx", import.meta.url);

describe("MessageCard i18n contract", () => {
  test("uses catalog keys for token suffix and agent prefix", async () => {
    const source = await readFile(SOURCE, "utf8");

    expect(source).toContain('t("transcript.tokenSuffix")');
    expect(source).toContain('t("transcript.agentPrefix"');
    expect(source).not.toContain("} tok");
    expect(source).not.toContain("agent:{message.agent}");
    expect(source).not.toContain(">agent:");
  });
});
