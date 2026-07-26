# Security Policy

OpencodeView is source-only software (Apache-2.0). It runs on the operator's machine, reads a local OpenCode database, and serves a local API/UI. This policy covers the code in this repository.

## Supported versions

| Version | Supported |
|---|---|
| `0.9.x` (tag `v0.9.0` and default branch) | Yes |
| Anything else | Best-effort on `main` only |

There is no hosted multi-tenant service. Fixes land on `main` and ship in the next source release.

## Reporting a vulnerability

Use GitHub private vulnerability reporting. Do **not** open a public issue for security bugs:

**<https://github.com/4i3n6/opencodeview/security/advisories/new>**

Include when possible:

- Impact (what an attacker gains, and from where: loopback vs LAN vs crafted cache)
- Minimal reproduction
- Affected paths/endpoints and a commit SHA or tag
- Whether exploitation requires non-loopback bind or a missing auth token

Do not attach real secrets, third-party personal data, or production transcripts.

## Security-relevant surface

In scope:

- Bind defaults (`OPENCODEVIEW_HOST`, default `127.0.0.1`) and fail-closed auth when binding beyond loopback (`OPENCODEVIEW_AUTH_TOKEN` in `src/server-config.ts`)
- Host/Origin guards on loopback requests
- Read-only open of `OPENCODE_DB` (`readonly: true`, `PRAGMA query_only = 1`)
- Separation of source vs cache paths (no aliasing)
- Server-side redaction (`src/redaction.ts`) on transcript/live routes before serialization
- Any path that could write the source DB, skip redaction, or skip auth off-loopback

Out of scope:

- Misconfiguration that exposes the API off-loopback without a token, against documented requirements
- Bugs solely in upstream OpenCode (report upstream)
- Social-engineering against individual operators' machines

## Disclosure

We aim to acknowledge reports quickly and fix confirmed issues before public disclosure. Response times are best-effort.

## Hardening tips for operators

- Keep the default loopback bind unless you know you need otherwise.
- If you bind non-loopback: set a strong `OPENCODEVIEW_AUTH_TOKEN`, terminate TLS upstream, and restrict network path.
- Treat `.cache/analytics.sqlite` like the source DB (derived sensitive aggregates).
- Re-run `bun src/scan.ts` after upgrading; schema assumptions can shift with OpenCode releases.
