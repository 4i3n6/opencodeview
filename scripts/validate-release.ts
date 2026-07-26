import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ReleaseValidationInput = {
  readonly repoRoot: string;
  readonly candidate: string;
};

export type ReleaseValidationResult = {
  readonly ok: boolean;
  readonly errors: readonly string[];
};

type JsonObject = { readonly [key: string]: unknown };

const gitleaksVersion = "8.30.1";
const gitleaksChecksum = "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb";
const gitleaksArtifact = `gitleaks_${gitleaksVersion}_linux_x64.tar.gz`;
const gitleaksDirCommand =
  "${GITLEAKS_BIN:-gitleaks} dir . --config .gitleaks.toml --redact=100 --no-color --exit-code 1 --max-archive-depth=1 --max-decode-depth=5 --report-format json --report-path gitleaks-report.json";
const gitleaksStagedCommand =
  "${GITLEAKS_BIN:-gitleaks} git --pre-commit --staged . --config .gitleaks.toml --redact=100 --no-color --exit-code 1 --max-archive-depth=1 --max-decode-depth=5";

const requiredFiles = [
  "LICENSE",
  ".editorconfig",
  ".gitattributes",
  ".gitleaks.toml",
  ".gitignore",
  "README.md",
  "README.pt-BR.md",
  "CONTRIBUTING.md",
  "GOVERNANCE.md",
  "SECURITY.md",
  "PRIVACY.md",
  "CODE_OF_CONDUCT.md",
  "CHANGELOG.md",
  ".github/workflows/ci.yml",
  ".github/pull_request_template.md",
  "lefthook.yml",
] as const;

const requiredRootScripts = [
  "test",
  "test:root",
  "test:web",
  "test:release",
  "typecheck",
  "lint",
  "build",
  "audit",
  "audit:dependencies",
  "audit:gitleaks",
  "release:check",
  "check",
  "validate:release",
  "validate:commit",
] as const;

export function validateReleaseCandidate(input: ReleaseValidationInput): ReleaseValidationResult {
  const errors: string[] = [];
  const packageJson = readJsonObject(join(input.repoRoot, "package.json"), "package.json", errors);
  const webPackageJson = readJsonObject(join(input.repoRoot, "web", "package.json"), "web/package.json", errors);

  if (!isSemver(input.candidate)) {
    errors.push(`${input.candidate} must be a valid SemVer candidate`);
  }

  for (const file of requiredFiles) {
    if (!existsSync(join(input.repoRoot, file))) {
      errors.push(`${file} is required`);
    }
  }

  checkPackageMetadata(packageJson, input.candidate, errors);
  checkRootScripts(packageJson, errors);
  checkLefthook(input.repoRoot, errors);
  checkCiWorkflow(input.repoRoot, errors);
  checkWebPackage(webPackageJson, input.candidate, errors);
  checkApacheLicense(input.repoRoot, errors);
  checkReadmeLinks(input.repoRoot, errors);
  checkChangelog(input.repoRoot, input.candidate, errors);
  checkReleaseNote(input.repoRoot, input.candidate, errors);
  checkLedger(input.repoRoot, input.candidate, errors);

  return { ok: errors.length === 0, errors };
}

function checkPackageMetadata(packageJson: JsonObject, candidate: string, errors: string[]): void {
  if (packageJson.version !== candidate) {
    errors.push(`package.json version must be ${candidate}`);
  }
  if (packageJson.private !== true) {
    errors.push("package.json must remain private: true");
  }
  if (packageJson.license !== "Apache-2.0") {
    errors.push("package.json license must be Apache-2.0");
  }
  if (packageJson.homepage !== "https://opencodeview.com") {
    errors.push("package.json homepage must be https://opencodeview.com");
  }

  const repository = objectValue(packageJson.repository);
  if (repository?.url !== "https://github.com/4i3n6/opencodeview.git") {
    errors.push("package.json repository.url must point to https://github.com/4i3n6/opencodeview.git");
  }
}

function checkRootScripts(packageJson: JsonObject, errors: string[]): void {
  const scripts = objectValue(packageJson.scripts);
  for (const script of requiredRootScripts) {
    if (typeof scripts?.[script] !== "string") {
      errors.push(`package.json scripts.${script} is required`);
    }
  }
  if (scripts?.check !== "bun run test && bun run typecheck && bun run lint && bun run build && bun run audit") {
    errors.push("package.json scripts.check must be the canonical local gate");
  }
  if (scripts?.audit !== "bun run audit:dependencies && bun run audit:release && bun run audit:gitleaks") {
    errors.push("package.json scripts.audit must run dependency, release, and Gitleaks audits");
  }
  if (scripts?.["audit:gitleaks"] !== gitleaksDirCommand) {
    errors.push("package.json scripts.audit:gitleaks must be the canonical fail-closed Gitleaks dir scan");
  }
}

function checkLefthook(repoRoot: string, errors: string[]): void {
  const lefthook = readText(join(repoRoot, "lefthook.yml"));
  const hasFailOpenScan = lefthook.includes("command -v gitleaks") || lefthook.includes("gitleaks protect") || lefthook.includes("skipping");
  if (!lefthook.includes(`run: ${gitleaksStagedCommand}`) || hasFailOpenScan) {
    errors.push("lefthook.yml gitleaks-staged must be the canonical fail-closed staged Gitleaks scan");
  }
}

function checkCiWorkflow(repoRoot: string, errors: string[]): void {
  const ci = readText(join(repoRoot, ".github", "workflows", "ci.yml"));
  const expectedUrl = `https://github.com/gitleaks/gitleaks/releases/download/v${gitleaksVersion}/${gitleaksArtifact}`;
  const expectedChecksum = `printf '${gitleaksChecksum}  ${gitleaksArtifact}\\n' | sha256sum -c -`;
  const expectedVersionCheck = `test "$($RUNNER_TEMP/gitleaks/gitleaks version)" = "${gitleaksVersion}"`;
  const hasPinnedInstaller = ci.includes("set -euo pipefail") && ci.includes(`curl -fsSLo ${gitleaksArtifact} ${expectedUrl}`) && ci.includes(expectedVersionCheck) && ci.includes(">> \"$GITHUB_PATH\"");
  const removesInstallerArtifact = ci.includes(`rm -f ${gitleaksArtifact}`);

  if (!hasPinnedInstaller || ci.includes("gitleaks-action") || ci.includes("continue-on-error")) {
    errors.push("CI workflow must install Gitleaks 8.30.1 from the official Linux x64 artifact");
  }
  if (!ci.includes(expectedChecksum)) {
    errors.push("CI workflow must verify the official Gitleaks 8.30.1 SHA256 checksum");
  }
  if (!removesInstallerArtifact) {
    errors.push("CI workflow must remove the Gitleaks installer tarball before the secret scan");
  }
}

function checkWebPackage(webPackageJson: JsonObject, candidate: string, errors: string[]): void {
  if (webPackageJson.private !== true) {
    errors.push("web/package.json must remain private: true");
  }
  if (webPackageJson.version !== candidate) {
    errors.push(`web/package.json version must be ${candidate}`);
  }
  if (webPackageJson.description !== "Source-run frontend for OpencodeView local analytics.") {
    errors.push("web/package.json description must describe the source-run frontend");
  }
}

function checkApacheLicense(repoRoot: string, errors: string[]): void {
  const license = readText(join(repoRoot, "LICENSE"));
  if (!license.includes("Apache License") || !license.includes("Version 2.0")) {
    errors.push("LICENSE must contain Apache License 2.0 text");
  }
}

function checkReadmeLinks(repoRoot: string, errors: string[]): void {
  const english = readText(join(repoRoot, "README.md"));
  const portuguese = readText(join(repoRoot, "README.pt-BR.md"));
  if (!english.includes("[Português](README.pt-BR.md)")) {
    errors.push("README.md must link to README.pt-BR.md");
  }
  if (!portuguese.includes("[English](README.md)")) {
    errors.push("README.pt-BR.md must link to README.md");
  }
}

function checkChangelog(repoRoot: string, candidate: string, errors: string[]): void {
  const changelog = readText(join(repoRoot, "CHANGELOG.md"));
  if (!changelog.includes(`## [${candidate}]`)) {
    errors.push(`CHANGELOG.md must document ${candidate}`);
  }
}

function checkReleaseNote(repoRoot: string, candidate: string, errors: string[]): void {
  const path = join(repoRoot, "docs", "release", `${candidate}.md`);
  const note = readText(path);
  if (!note.includes(candidate)) {
    errors.push(`docs/release/${candidate}.md must be the matching draft release note`);
  }
}

function checkLedger(repoRoot: string, candidate: string, errors: string[]): void {
  const ledger = readJsonObject(join(repoRoot, "docs", "release", "ledger.json"), "docs/release/ledger.json", errors);
  if (ledger.schemaVersion !== 1) {
    errors.push("docs/release/ledger.json schemaVersion must be 1");
  }
  if (!Array.isArray(ledger.releases)) {
    errors.push("docs/release/ledger.json releases must be an array");
    return;
  }

  const releases = ledger.releases;
  if (releases.length === 0) {
    return;
  }

  let previousVersion: string | null = null;
  for (const [index, entry] of releases.entries()) {
    if (!isObject(entry)) {
      errors.push(`docs/release/ledger.json releases[${index}] must be an object`);
      continue;
    }
    const version = typeof entry.version === "string" ? entry.version : "";
    const tag = typeof entry.tag === "string" ? entry.tag : "";
    const date = typeof entry.date === "string" ? entry.date : "";
    const notes = typeof entry.notes === "string" ? entry.notes : "";

    if (!isSemver(version)) {
      errors.push(`docs/release/ledger.json releases[${index}].version must be SemVer`);
    }
    if (tag !== `v${version}`) {
      errors.push(`docs/release/ledger.json releases[${index}].tag must be v${version}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
      errors.push(`docs/release/ledger.json releases[${index}].date must be YYYY-MM-DD`);
    }
    if (notes !== `docs/release/${version}.md`) {
      errors.push(`docs/release/ledger.json releases[${index}].notes must be docs/release/${version}.md`);
    } else if (!existsSync(join(repoRoot, notes))) {
      errors.push(`${notes} is missing for ledger entry ${version}`);
    }
    if (previousVersion !== null && previousVersion === version) {
      errors.push(`docs/release/ledger.json must not repeat version ${version}`);
    }
    previousVersion = version;
  }

  const latest = releases[releases.length - 1];
  if (isObject(latest) && typeof latest.version === "string" && latest.version !== candidate) {
    errors.push(
      `docs/release/ledger.json latest release ${latest.version} must match package candidate ${candidate}`,
    );
  }
}

function readJsonObject(path: string, label: string, errors: string[]): JsonObject {
  const text = readText(path);
  if (!text) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      errors.push(`${label} must contain valid JSON`);
      return {};
    }
    throw error;
  }
  if (isObject(parsed)) {
    return parsed;
  }
  errors.push(`${label} must contain a JSON object`);
  return {};
}

function readText(path: string): string {
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf8");
}

function objectValue(value: unknown): JsonObject | undefined {
  return isObject(value) ? value : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSemver(value: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.test(value);
}

if (import.meta.main) {
  const candidate = process.argv[2] ?? "0.9.0";
  const result = validateReleaseCandidate({ repoRoot: process.cwd(), candidate });
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }
}
