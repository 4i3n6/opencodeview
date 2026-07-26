import { existsSync, readFileSync } from "node:fs";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const conventionalCommitPattern = /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9._-]+\))?!?: .+$/u;

export function validateConventionalCommit(message: string): ValidationResult {
  const subject = message.split(/\r?\n/u)[0]?.trim() ?? "";
  if (conventionalCommitPattern.test(subject)) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "Commit message must follow Conventional Commits, for example: feat: add release harness",
  };
}

function readMessage(input: string | undefined): string {
  if (input === undefined) {
    return "";
  }

  if (existsSync(input)) {
    return readFileSync(input, "utf8");
  }

  return input;
}

if (import.meta.main) {
  const result = validateConventionalCommit(readMessage(process.argv[2]));
  if (!result.ok) {
    console.error(result.reason);
    process.exit(1);
  }
}
