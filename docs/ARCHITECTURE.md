# Architecture

One-page map of OpencodeView for contributors and upstream readers.

## Purpose

OpencodeView is a **local, read-only companion** to OpenCode. It does not implement agents, does not write OpenCode's database, and does not host multi-tenant analytics.

```
┌─────────────────────┐     scan.ts (write cache only)     ┌──────────────────────────┐
│  opencode.db        │ ─────────────────────────────────► │  analytics.sqlite        │
│  (OpenCode source)  │                                    │  (OpencodeView cache)    │
│  RO always          │ ◄── transcript + live (RO) ─────── │  RO for API              │
└─────────────────────┘                                    └────────────┬─────────────┘
                                                                       │
                                                              server.ts (Hono)
                                                                       │
                                                              /api/*  (loopback)
                                                                       │
                                                              Vite UI (web/)
```

## Processes

| Process | Entry | Role |
|---|---|---|
| Scanner | `bun src/scan.ts` | Reads source DB RO; writes/reconciles cache |
| API | `bun run serve` → `src/server.ts` | Serves JSON from cache (+ two source routes) |
| UI | `bun run web` → `web/` | Dashboard; proxies `/api` in dev |

## Data boundaries

| Store | Env | Writer | Reader |
|---|---|---|---|
| OpenCode sessions | `OPENCODE_DB` | OpenCode only | scan + transcript/live |
| Derived metrics | `OPENCODEVIEW_CACHE` | `scan.ts` only | API (RO) |

Invariants:

1. Source open flags: `readonly: true` and `PRAGMA query_only = 1`.
2. Cache path must not be the same file, symlink, or hardlink as the source.
3. Redaction (`src/redaction.ts`) runs **server-side** before transcript/live JSON leaves the process.
4. Default bind is loopback. Non-loopback requires `OPENCODEVIEW_AUTH_TOKEN` or startup fails.

## Request paths

**Cache-backed (typical):**

`UI → GET /api/projects|efficiency|… → server → cache SQLite → JSON`

**Source-backed (intentional exceptions):**

- `GET /api/session/:id/transcript` — message/part text not fully materialized in cache
- `GET /api/live` — in-progress session state

Both still RO + redacted.

## Code map

| Path | Responsibility |
|---|---|
| `src/scan.ts` | Project/session rollups, flags, tool metrics, cache schema |
| `src/server.ts` | Hono routes, bind/auth guards, query_only connections |
| `src/server-config.ts` | Host/port/token fail-closed rules |
| `src/redaction.ts` | Secret/path scrubbing for outbound payloads |
| `src/stats.ts` | Shared numeric helpers (EWMA, changepoint, …) |
| `web/src/App.tsx` | Shell, locale, lazy view boundaries |
| `web/src/lib/api/` | Typed clients for `/api/*` |
| `web/src/components/` | BI panels, charts, live, transcript |
| `web/src/i18n/` | EN-US / PT-BR catalogs |
| `scripts/validate-release.ts` | Release metadata gate |
| `scripts/assert-github-identity.ts` | Maintainer GitHub identity gate (`4i3n6`) |

## Security model (short)

- **Trust boundary:** operator machine. Not a multi-tenant server product.
- **Default exposure:** `127.0.0.1` only.
- **Auth:** bearer token mandatory when `OPENCODEVIEW_HOST` is non-loopback.
- **No telemetry:** runtime does not open outbound product analytics.

Details: [SECURITY.md](../SECURITY.md), [PRIVACY.md](../PRIVACY.md).

## Upstream coupling

OpenCode owns `opencode.db` schema evolution. OpencodeView's SQLite adapter is best-effort and may lag migrations. Prefer fixing source-data issues upstream when they are OpenCode bugs; treat flags here as local operator heuristics.

## Related docs

- Operator quickstart: [README.md](../README.md)
- UI visual contract: [DESIGN.md](../DESIGN.md)
- Contributing: [CONTRIBUTING.md](../CONTRIBUTING.md)
