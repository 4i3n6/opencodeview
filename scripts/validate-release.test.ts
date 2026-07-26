import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateReleaseCandidate } from "./validate-release.ts";

const candidate = "0.9.0";
const gitleaksVersion = "8.30.1";
const gitleaksChecksum = "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb";
const gitleaksDirCommand =
  "${GITLEAKS_BIN:-gitleaks} dir . --config .gitleaks.toml --redact=100 --no-color --exit-code 1 --max-archive-depth=1 --max-decode-depth=5 --report-format json --report-path gitleaks-report.json";
const gitleaksStagedCommand =
  "${GITLEAKS_BIN:-gitleaks} git --pre-commit --staged . --config .gitleaks.toml --redact=100 --no-color --exit-code 1 --max-archive-depth=1 --max-decode-depth=5";

type ReleaseFixtureOptions = {
  readonly includeDependencyAudit?: boolean;
  readonly auditScript?: string;
  readonly packageGitleaksScript?: string;
  readonly lefthookGitleaksCommand?: string;
  readonly ciWorkflow?: string;
};

describe("validateReleaseCandidate", () => {
  test("passes when the local OSS release harness artifacts are complete", () => {
    const repo = makeReleaseFixture();
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result).toEqual({ ok: true, errors: [] });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("passes when the ledger records a published candidate release", () => {
    const repo = makeReleaseFixture();
    try {
      writeJson(join(repo, "docs", "release", "ledger.json"), {
        schemaVersion: 1,
        releases: [
          {
            version: candidate,
            tag: `v${candidate}`,
            date: "2026-07-26",
            notes: `docs/release/${candidate}.md`,
          },
        ],
      });

      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result).toEqual({ ok: true, errors: [] });
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when a ledger entry points at a missing release note", () => {
    const repo = makeReleaseFixture();
    try {
      writeJson(join(repo, "docs", "release", "ledger.json"), {
        schemaVersion: 1,
        releases: [
          {
            version: candidate,
            tag: `v${candidate}`,
            date: "2026-07-26",
            notes: `docs/release/${candidate}.md`,
          },
        ],
      });
      rmSync(join(repo, "docs", "release", `${candidate}.md`));

      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain(`docs/release/${candidate}.md is missing for ledger entry ${candidate}`);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when required release artifacts are missing", () => {
    const repo = makeReleaseFixture();
    try {
      rmSync(join(repo, "CHANGELOG.md"));

      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain(`CHANGELOG.md must document ${candidate}`);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when dependency auditing is absent from the root gate", () => {
    const repo = makeReleaseFixture({ includeDependencyAudit: false });
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("package.json scripts.audit:dependencies is required");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when the root audit gate bypasses Gitleaks", () => {
    const repo = makeReleaseFixture({ auditScript: "bun run audit:dependencies && bun run audit:release" });
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("package.json scripts.audit must run dependency, release, and Gitleaks audits");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when the package Gitleaks script can skip a missing binary", () => {
    const repo = makeReleaseFixture({
      packageGitleaksScript:
        "if command -v gitleaks >/dev/null 2>&1; then gitleaks detect --source . --no-git --redact --config .gitleaks.toml; else printf 'gitleaks not installed; skipping secret scan\\n'; fi",
    });
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("package.json scripts.audit:gitleaks must be the canonical fail-closed Gitleaks dir scan");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when the Lefthook staged Gitleaks scan can skip a missing binary", () => {
    const repo = makeReleaseFixture({
      lefthookGitleaksCommand:
        "if command -v gitleaks >/dev/null 2>&1; then gitleaks protect --staged --redact --config .gitleaks.toml; else printf 'gitleaks not installed; skipping staged secret scan\\n'; fi",
    });
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("lefthook.yml gitleaks-staged must be the canonical fail-closed staged Gitleaks scan");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when CI omits the pinned Gitleaks installer", () => {
    const repo = makeReleaseFixture({ ciWorkflow: "name: CI\n" });
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("CI workflow must install Gitleaks 8.30.1 from the official Linux x64 artifact");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when CI pins the wrong Gitleaks version", () => {
    const repo = makeReleaseFixture({ ciWorkflow: makeCiWorkflow({ version: "8.30.0" }) });
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("CI workflow must install Gitleaks 8.30.1 from the official Linux x64 artifact");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when CI pins the wrong Gitleaks checksum", () => {
    const repo = makeReleaseFixture({ ciWorkflow: makeCiWorkflow({ checksum: "0000000000000000000000000000000000000000000000000000000000000000" }) });
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("CI workflow must verify the official Gitleaks 8.30.1 SHA256 checksum");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  test("fails when CI leaves the Gitleaks installer tarball in the workspace", () => {
    const repo = makeReleaseFixture({
      ciWorkflow: makeCiWorkflow().replace(`          rm -f gitleaks_${gitleaksVersion}_linux_x64.tar.gz\n`, ""),
    });
    try {
      const result = validateReleaseCandidate({ repoRoot: repo, candidate });

      expect(result.ok).toBe(false);
      expect(result.errors).toContain("CI workflow must remove the Gitleaks installer tarball before the secret scan");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

function makeReleaseFixture(options: ReleaseFixtureOptions = {}): string {
  const includeDependencyAudit = options.includeDependencyAudit ?? true;
  const repo = mkdtempSync(join(tmpdir(), "opencodeview-release-"));
  mkdirSync(join(repo, ".github", "workflows"), { recursive: true });
  mkdirSync(join(repo, "docs", "release"), { recursive: true });
  mkdirSync(join(repo, "web"), { recursive: true });
  mkdirSync(join(repo, "scripts"), { recursive: true });

  writeJson(join(repo, "package.json"), {
    name: "opencodeview",
    version: candidate,
    private: true,
    license: "Apache-2.0",
    homepage: "https://opencodeview.com",
    repository: { type: "git", url: "https://github.com/4i3n6/opencodeview.git" },
  });
  writeJson(join(repo, "web", "package.json"), {
    name: "opencodeview-web",
    description: "Source-run frontend for OpencodeView local analytics.",
    version: candidate,
    private: true,
  });
  writeFileSync(join(repo, "LICENSE"), "Apache License\nVersion 2.0, January 2004\n", "utf8");
  writeFileSync(join(repo, ".editorconfig"), "root = true\n", "utf8");
  writeFileSync(join(repo, ".gitattributes"), "* text=auto eol=lf\n", "utf8");
  writeFileSync(join(repo, ".gitleaks.toml"), "title = \"test\"\n", "utf8");
  writeFileSync(join(repo, ".gitignore"), "node_modules/\n.cache/\n", "utf8");
  writeFileSync(join(repo, "README.md"), "# OpencodeView\n\n**English** · [Português](README.pt-BR.md)\n", "utf8");
  writeFileSync(join(repo, "README.pt-BR.md"), "# OpencodeView\n\n[English](README.md) · **Português**\n", "utf8");
  writeFileSync(join(repo, "CONTRIBUTING.md"), "# Contributing\n", "utf8");
  writeFileSync(join(repo, "GOVERNANCE.md"), "# Governance\n", "utf8");
  writeFileSync(join(repo, "SECURITY.md"), "# Security\n", "utf8");
  writeFileSync(join(repo, "PRIVACY.md"), "# Privacy\n", "utf8");
  writeFileSync(join(repo, "CODE_OF_CONDUCT.md"), "# Code of Conduct\n", "utf8");
  writeFileSync(join(repo, "CHANGELOG.md"), `# Changelog\n\n## [${candidate}] - Unreleased\n`, "utf8");
  writeFileSync(join(repo, "docs", "release", `${candidate}.md`), `# OpencodeView ${candidate}\n\nDraft release note.\n`, "utf8");
  writeJson(join(repo, "docs", "release", "ledger.json"), { schemaVersion: 1, releases: [] });
  writeFileSync(join(repo, ".github", "workflows", "ci.yml"), options.ciWorkflow ?? makeCiWorkflow(), "utf8");
  writeFileSync(join(repo, ".github", "pull_request_template.md"), "## Summary\n", "utf8");
  writeFileSync(join(repo, "lefthook.yml"), makeLefthookConfig(options.lefthookGitleaksCommand ?? gitleaksStagedCommand), "utf8");
  writeJson(join(repo, "package.json"), {
    name: "opencodeview",
    version: candidate,
    private: true,
    license: "Apache-2.0",
    homepage: "https://opencodeview.com",
    repository: { type: "git", url: "https://github.com/4i3n6/opencodeview.git" },
    scripts: {
      test: "bun run test:root && bun run test:web",
      "test:root": "bun test src/*.test.ts scripts/*.test.ts",
      "test:web": "cd web && bun run test",
      "test:release": "bun test scripts/conventional-commit.test.ts scripts/validate-release.test.ts",
      typecheck: "bun run typecheck:root && bun run typecheck:web",
      lint: "bun run lint:root && bun run lint:web",
      build: "cd web && bun run build",
      audit: options.auditScript ?? "bun run audit:dependencies && bun run audit:release && bun run audit:gitleaks",
      ...(includeDependencyAudit ? { "audit:dependencies": "bun audit && cd web && bun audit" } : {}),
      "audit:gitleaks": options.packageGitleaksScript ?? gitleaksDirCommand,
      "release:check": "bun run test:release && bun run validate:release",
      check: "bun run test && bun run typecheck && bun run lint && bun run build && bun run audit",
      "validate:release": `bun scripts/validate-release.ts ${candidate}`,
      "validate:commit": "bun scripts/validate-conventional-commit.ts",
    },
  });

  return repo;
}

function writeJson(path: string, value: object): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeLefthookConfig(gitleaksCommand: string): string {
  return `pre-commit:
  parallel: false
  commands:
    gitleaks-staged:
      run: ${gitleaksCommand}
`;
}

function makeCiWorkflow(overrides: { readonly version?: string; readonly checksum?: string } = {}): string {
  const version = overrides.version ?? gitleaksVersion;
  const checksum = overrides.checksum ?? gitleaksChecksum;
  const artifact = `gitleaks_${version}_linux_x64.tar.gz`;

  return `name: CI

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Install Gitleaks
        run: |
          set -euo pipefail
          curl -fsSLo ${artifact} https://github.com/gitleaks/gitleaks/releases/download/v${version}/${artifact}
          printf '${checksum}  ${artifact}\\n' | sha256sum -c -
          mkdir -p "$RUNNER_TEMP/gitleaks"
          tar -xzf ${artifact} -C "$RUNNER_TEMP/gitleaks" gitleaks
          rm -f ${artifact}
          test "$(${"$RUNNER_TEMP/gitleaks/gitleaks"} version)" = "${version}"
          printf '%s\n' "$RUNNER_TEMP/gitleaks" >> "$GITHUB_PATH"

      - name: Run local gate
        run: bun run check
`;
}
