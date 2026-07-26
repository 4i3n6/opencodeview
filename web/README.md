# OpencodeView Web

Vite + React frontend for OpencodeView. Not published as a standalone package — run it from the repo root.

## Run

From repository root (API should already be on `127.0.0.1:4317`):

```bash
bun run web
# -> http://127.0.0.1:5273  (dev server proxies /api)
```

From this directory:

```bash
bun install
bun run dev
```

## Package scripts

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

## Layout (short)

| Path | Role |
|---|---|
| `src/App.tsx` | Shell, routing, lazy view boundaries |
| `src/components/` | BI panels, tables, charts, live/transcript |
| `src/lib/api/` | Typed client for `/api/*` |
| `src/i18n/` | EN-US / PT-BR catalogs |
| `src/components/ui/` | Dense primitives (card, table, badge, …) |

Visual contract: root [DESIGN.md](../DESIGN.md). Contributing: root [CONTRIBUTING.md](../CONTRIBUTING.md).
