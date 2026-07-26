# Contributing to OpencodeView

Thanks for helping. This is a small, source-only tool for developers who already run OpenCode locally. Keep proposals focused.

## Ground rules

- Read [README.md](README.md) for operator quickstart, env vars, and the local-first security model.
- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the one-page system map.
- Search existing issues/PRs before opening duplicates.
- Security-sensitive work (bind address, auth, redaction, source DB access) needs an issue discussion **before** a large PR. See [SECURITY.md](SECURITY.md).
- Do not weaken defaults (loopback bind, auth beyond loopback, read-only source, server-side redaction) without explicit justification in the PR.
- Public docs are EN-US canonical with PT-BR parity for user-facing mirrors (`README`, `DESIGN`). Code, identifiers, and comments stay EN-US.

## Setup

```bash
git clone https://github.com/4i3n6/opencodeview.git
cd opencodeview
bun install
cd web && bun install && cd ..
```

Requires Bun `>= 1.3.0`. Optional: install [Gitleaks](https://github.com/gitleaks/gitleaks) (or set `GITLEAKS_BIN`) — `bun run check` fails closed without it.

```bash
# optional hooks
lefthook install
```

Run the stack:

```bash
bun src/scan.ts --all
bun run serve    # 127.0.0.1:4317
bun run web      # 127.0.0.1:5273
```

## Workflow

1. Fork and branch from `main`:
   ```bash
   git checkout -b fix/short-slug
   # or feat/..., docs/..., chore/...
   ```
2. Make an atomic change. One logical unit per commit.
3. Conventional Commits are required (hook-enforced), e.g.:
   ```
   fix(scan): correct active_min gap clustering
   feat(web): add empty state for tools panel
   docs: document OPENCODEVIEW_CACHE layout
   ```
4. Run the full local gate before pushing:
   ```bash
   bun run check
   ```
   Release-metadata-only changes can also run:
   ```bash
   bun run release:check
   ```
5. Open a PR against `main`. Fill the template. Link the issue if there is one.

### What must stay true

| Area | Expectation |
|---|---|
| Source DB | Never write/migrate/repair `opencode.db` |
| Cache | Separate file; no symlink/hardlink alias to source |
| Auth / bind | Loopback default; token required off-loopback |
| Redaction | Server-side only; do not move to the client |
| Tests | Happy path + edge + adjacent regression for behavior changes |
| i18n | New UI strings in both `en-US` and `pt-BR` catalogs |
| Docs | Update README EN + PT (and DESIGN if UI contracts change) |

### Tests

```bash
bun run test          # root + web
bun run test:root
bun run test:web
```

Behavioral change = RED → GREEN → exercise the real surface (API route, scan path, or UI panel). Prefer fixtures/synthetic SQLite; never commit real user DBs, auth, or transcripts.

### Secrets and privacy in contributions

- No secrets, tokens, absolute home paths, or personal data in commits, fixtures, screenshots, or PR text.
- Gitleaks runs on staged files and in `bun run check`.
- Git identity for maintainers of this repo is `4i3n6` only (see `scripts/assert-github-identity.ts`). Contributors use their own GitHub account on forks.

## Review

- CI must be green.
- At least one maintainer review for non-trivial changes.
- Security-touching PRs get explicit security review notes in the thread.
- Squash or rebase is fine if history stays readable; do not force-push shared branches without coordination.

## Bugs and features

- **Bug**: steps to reproduce, expected vs actual, Bun/OS versions, whether a custom `OPENCODE_DB` is involved.
- **Feature**: problem statement first, not only the proposed UI. Wait for direction on large work.
- **Security**: never file a public issue — use private reporting in [SECURITY.md](SECURITY.md).

## License

By contributing, you agree your contributions are licensed under the project's [Apache License 2.0](LICENSE).
