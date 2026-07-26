# Arquitetura

Mapa de uma página do OpencodeView para contribuidores e leitores upstream.

## Propósito

O OpencodeView é um **companion local e somente-leitura** do OpenCode. Não implementa agentes, não escreve no banco do OpenCode e não hospeda analytics multi-tenant.

```
┌─────────────────────┐     scan.ts (escreve só cache)     ┌──────────────────────────┐
│  opencode.db        │ ─────────────────────────────────► │  analytics.sqlite        │
│  (fonte OpenCode)   │                                    │  (cache OpencodeView)    │
│  sempre RO          │ ◄── transcript + live (RO) ─────── │  RO para a API           │
└─────────────────────┘                                    └────────────┬─────────────┘
                                                                       │
                                                              server.ts (Hono)
                                                                       │
                                                              /api/*  (loopback)
                                                                       │
                                                              UI Vite (web/)
```

## Processos

| Processo | Entrada | Papel |
|---|---|---|
| Scanner | `bun src/scan.ts` | Lê fonte RO; escreve/reconcilia cache |
| API | `bun run serve` → `src/server.ts` | JSON a partir do cache (+ duas rotas na fonte) |
| UI | `bun run web` → `web/` | Dashboard; em dev faz proxy de `/api` |

## Fronteiras de dados

| Store | Env | Escritor | Leitor |
|---|---|---|---|
| Sessões OpenCode | `OPENCODE_DB` | Somente OpenCode | scan + transcript/live |
| Métricas derivadas | `OPENCODEVIEW_CACHE` | Somente `scan.ts` | API (RO) |

Invariantes:

1. Abertura da fonte: `readonly: true` e `PRAGMA query_only = 1`.
2. O path do cache não pode ser o mesmo arquivo, symlink ou hardlink da fonte.
3. Redação (`src/redaction.ts`) roda **server-side** antes do JSON de transcript/live sair do processo.
4. Bind default é loopback. Fora de loopback exige `OPENCODEVIEW_AUTH_TOKEN` ou o startup falha.

## Caminhos de request

**Via cache (típico):**

`UI → GET /api/projects|efficiency|… → server → cache SQLite → JSON`

**Via fonte (exceções intencionais):**

- `GET /api/session/:id/transcript` — texto de mensagens/parts não totalmente materializado no cache
- `GET /api/live` — estado de sessões em andamento

Ambas continuam RO + redigidas.

## Mapa de código

| Path | Responsabilidade |
|---|---|
| `src/scan.ts` | Rollups projeto/sessão, flags, tool metrics, schema do cache |
| `src/server.ts` | Rotas Hono, guards de bind/auth, conexões query_only |
| `src/server-config.ts` | Regras fail-closed de host/port/token |
| `src/redaction.ts` | Scrub de segredos/paths em payloads de saída |
| `src/stats.ts` | Helpers numéricos (EWMA, changepoint, …) |
| `web/src/App.tsx` | Shell, locale, boundaries lazy de views |
| `web/src/lib/api/` | Clients tipados para `/api/*` |
| `web/src/components/` | Painéis BI, charts, live, transcript |
| `web/src/i18n/` | Catálogos EN-US / PT-BR |
| `scripts/validate-release.ts` | Gate de metadados de release |
| `scripts/assert-github-identity.ts` | Gate de identidade GitHub do maintainer (`4i3n6`) |

## Modelo de segurança (curto)

- **Fronteira de confiança:** máquina do operador. Não é produto multi-tenant.
- **Exposição default:** só `127.0.0.1`.
- **Auth:** bearer obrigatório quando `OPENCODEVIEW_HOST` não é loopback.
- **Sem telemetria:** o runtime não abre analytics de produto de saída.

Detalhes: [SECURITY.md](../SECURITY.md), [PRIVACY.md](../PRIVACY.md).

## Acoplamento upstream

O OpenCode é dono da evolução do schema de `opencode.db`. O adapter SQLite do OpencodeView é best-effort e pode atrasar migrações. Prefira corrigir problemas de dados na fonte no OpenCode quando forem bugs de lá; trate flags daqui como heurísticas locais do operador.

## Docs relacionadas

- Quickstart do operador: [README.pt-BR.md](../README.pt-BR.md)
- Contrato visual da UI: [DESIGN.pt-BR.md](../DESIGN.pt-BR.md)
- Contribuindo: [CONTRIBUTING.md](../CONTRIBUTING.md)
