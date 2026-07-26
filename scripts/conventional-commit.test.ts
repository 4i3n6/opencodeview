import { describe, expect, test } from "bun:test";
import { validateConventionalCommit } from "./validate-conventional-commit.ts";

describe("validateConventionalCommit", () => {
  test("accepts Conventional Commits with optional scope and breaking marker", () => {
    const messages = [
      "feat: add release harness",
      "fix(ci): preserve frozen Bun installs",
      "docs!: document alpha release process",
    ];

    for (const message of messages) {
      expect(validateConventionalCommit(message)).toEqual({ ok: true });
    }
  });

  test("rejects messages outside Conventional Commits", () => {
    const result = validateConventionalCommit("update stuff");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Conventional Commits");
    }
  });
});
