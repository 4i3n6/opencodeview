# Privacy

OpencodeView is local software. It reads files on your machine and serves a loopback API/UI. It does not phone home.

## Data read

| Source | Path / control | Mode |
|---|---|---|
| OpenCode session DB | `OPENCODE_DB` (default `~/.local/share/opencode/opencode.db`) | Read-only SQLite |
| Optional activity log | `OH_MY_OPENCODE_LOG` | Tailed for live signals |

Contents are whatever OpenCode already stored (session metadata, messages, tool I/O, tokens, cost fields, paths, etc.).

## Data written

| Artifact | Path / control | Writer |
|---|---|---|
| Analytics cache | `OPENCODEVIEW_CACHE` (default `.cache/analytics.sqlite`) | `bun src/scan.ts` only |

The API opens the cache read-only. OpencodeView never writes the OpenCode source DB.

## Network

By default: **no outbound network**.

Inbound only if you run:

- `bun run serve` — HTTP API (default `127.0.0.1:4317`)
- `bun run web` — Vite dev UI (default `127.0.0.1:5273`, proxies `/api`)

Binding the API off-loopback is explicit (`OPENCODEVIEW_HOST`) and requires `OPENCODEVIEW_AUTH_TOKEN`. See [README.md](README.md#security-defaults) and [SECURITY.md](SECURITY.md).

## Redaction

Transcript and live payloads pass through `src/redaction.ts` before leaving the process:

- Secret-like key names / patterns
- Bearer tokens and common provider prefixes
- Credentials in URLs
- Absolute user-home paths

Redaction is pattern-based and best-effort. Review it against your data before any non-loopback exposure. API responses use `Cache-Control: no-store`.

## Operator responsibility

Your OpenCode DB may hold sensitive coding-session content. OpencodeView keeps that data local for analytics. Treat the cache file with the same care as the source DB. Do not commit either file to git (they are ignored).

## Third parties

No analytics SDKs, crash reporters, update pings, or external AI calls are bundled. Dependencies may have their own networks only if **you** run package installs or CI against the public internet — that is outside the runtime of `serve` / `web` / `scan`.
