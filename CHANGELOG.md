# Changelog

All notable changes to OpencodeView will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Rewrote public docs (README EN/PT, CONTRIBUTING, SECURITY, PRIVACY, GOVERNANCE,
  CODE_OF_CONDUCT, web README, PR template) for a clearer OSS developer audience.
- Softened public and UI copy for an OpenCode-maintainer audience: clearer
  independence framing, neutral upstream wording, and less adversarial flag labels.
- Added synthetic dashboard preview image, one-page architecture docs (EN/PT),
  and collaborative GitHub issue templates (bug, feature, maintainer question).

## [0.9.0] - 2026-07-26

First source-only OSS release under Apache-2.0. Packages remain `private: true`.
There is no package registry distribution, binary, installer, or container
image. Run from source.

### Added

- Local, read-only, project-first analytics over OpenCode's `opencode.db`, with
  derived metrics in a separate SQLite cache.
- Scan CLI, Hono API on loopback, and Vite/React dashboard (EN-US / PT-BR).
- Security defaults: loopback bind, optional bearer auth beyond loopback,
  server-side redaction, `Cache-Control: no-store`, and no telemetry.
- Release harness: SemVer manifests, Keep a Changelog,
  `docs/release/ledger.json`, release note `docs/release/0.9.0.md`, Conventional
  Commits validation, CI safety net, Gitleaks fail-closed, and
  `bun run release:check`.
- Exclusive GitHub identity gate for owner account `4i3n6`
  (`scripts/assert-github-identity.ts`, Lefthook pre-commit/pre-push).
- Dashboard performance and a11y: lazy-loaded views/charts, overflow-gated
  table scroll affordances, `PanelStatus` loading/empty/error states, specific
  table accessible labels, and chart `title`/`desc` names.

### Security

- Remediated the PostCSS advisory via the Vite parent dependency chain and
  regenerated Bun lock data (no direct PostCSS dependency, audits stay strict).
