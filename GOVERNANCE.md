# Governance

OpencodeView is maintained by [@4i3n6](https://github.com/4i3n6) on a best-effort basis. This document describes how decisions are made while the project is small. It will be revised if the contributor base grows.

## Decision-making

- The maintainer has final say on scope, architecture, security defaults, and merges.
- Changes that touch the security model (bind defaults, auth, redaction, read-only source access) require explicit maintainer review and a written justification in the PR. See [CONTRIBUTING.md](CONTRIBUTING.md).
- Non-trivial design or architecture work should start as a GitHub issue so direction is fixed before code lands.

## Maintainer responsibilities

- Triage issues and PRs.
- Review, merge, or decline contributions with reasoning.
- Handle security reports per [SECURITY.md](SECURITY.md).
- Keep public docs accurate (`README.md`, `README.pt-BR.md`, `DESIGN.md`, `DESIGN.pt-BR.md`, this file).
- Own releases under the process below.

## Releases

Current source-only release: **`0.9.0`** (tag `v0.9.0`). Packages stay `private: true` — no registry/binary/container distribution.

Release contract:

- SemVer
- Keep a Changelog (`CHANGELOG.md`)
- Ledger entry in `docs/release/ledger.json`
- Narrative note in `docs/release/<version>.md`
- Local gate green:

```bash
bun run check
bun run release:check
```

The harness validates metadata. It does not itself create tags, push, or open GitHub Releases. Those steps are maintainer-operated and identity-gated to GitHub user `4i3n6`.

## Becoming a contributor

No formal ladder yet. Sustained, high-quality contributions (code, docs, translations, careful security review) are the path to more responsibility. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
