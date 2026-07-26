# OpencodeView

[![CI](https://github.com/4i3n6/opencodeview/actions/workflows/ci.yml/badge.svg)](https://github.com/4i3n6/opencodeview/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/4i3n6/opencodeview)](https://github.com/4i3n6/opencodeview/releases)
[![License](https://img.shields.io/github/license/4i3n6/opencodeview)](LICENSE)

[English](README.md) · **Português**

> Analytics local-first sobre dados de sessão do OpenCode. Somente-leitura em `opencode.db`. Cache derivado separado. Sem SaaS, sem telemetria.

O OpencodeView é um **companion independente e não oficial** para quem já roda [OpenCode](https://opencode.ai) localmente. Não faz parte do OpenCode, não é afiliado à equipe do OpenCode e não substitui a superfície de produto do OpenCode.

Site: <https://opencodeview.com>

**v0.9.0 é source-only.** Clone e rode com Bun. Sem pacote npm, binário, container ou instalador. Trate APIs, schema de cache, flags de CLI e env vars como instáveis até o `1.0.0`.

### Preview da UI (dados sintéticos de amostra)

<table>
  <tr>
    <td width="50%"><img src="docs/images/preview-live.png" alt="Árvore Live com painéis de saúde e atenção (sintético)" /></td>
    <td width="50%"><img src="docs/images/preview-overview.png" alt="Visão geral com rollups por projeto (sintético)" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/preview-efficiency.png" alt="Eficiência: mix de modelos e tabela de agentes (sintético)" /></td>
    <td width="50%"><img src="docs/images/preview-orchestration.png" alt="Orquestração: roteamento e árvore de delegação (sintético)" /></td>
  </tr>
</table>

<p align="center"><sub>Previews sintéticos para documentação — não são dados reais de usuário. Projetos, sessões e métricas são fabricados.</sub></p>

Mapa detalhado: [docs/ARCHITECTURE.pt-BR.md](docs/ARCHITECTURE.pt-BR.md) · [English](docs/ARCHITECTURE.md)

---

## Relação com o OpenCode

O OpenCode é dono do runtime do agente e do store on-disk de sessões. O OpencodeView só **lê** esse store (e logs locais opcionais), deriva agregados no próprio cache e serve um dashboard local.

Se algo parecer errado nos dados da fonte, prefira investigar ou reportar no OpenCode quando fizer sentido. Flags e dicas de qualidade aqui são **sinais locais do operador** derivados de linhas no disco, não juízos sobre a qualidade do produto OpenCode.

## Para quem é

Você já usa OpenCode local e quer respostas do tipo:

- Quais projetos consomem mais tokens e tempo ativo?
- Quais modelos/agentes têm alta taxa de erro de tool ou baixo rendimento de patch?
- Quão profundas ou largas são as árvores de subagente / delegação?
- Quais sessões estão em andamento agora, sem exportar transcripts à mão?

Se você precisa de produto hospedado multi-tenant, UI oficial do OpenCode ou contrato público versionado contra `opencode.db`, veja [Fora de escopo](#fora-de-escopo).

## Por que existe

O OpenCode já persiste histórico local rico. O OpencodeView transforma esse histórico em analytics project-scoped na sua máquina, sem enviar dados de sessão a terceiros.

| Princípio | Comportamento |
|---|---|
| Local-first | Bind default em loopback. Sem telemetria. Sem chamadas de saída do app. |
| Fonte RO | `opencode.db` abre com `readonly: true` + `PRAGMA query_only = 1`. |
| Cache separado | Métricas derivadas só em `OPENCODEVIEW_CACHE`. Nunca alias do arquivo fonte. |
| Redação antes de sair | Payloads de transcript/live são redigidos server-side antes do JSON sair do processo. |
| Fail closed | Bind fora de loopback sem `OPENCODEVIEW_AUTH_TOKEN` recusa subir. |

## Início rápido

Requer [Bun](https://bun.sh) `>= 1.3.0` e um DB local do OpenCode (default `~/.local/share/opencode/opencode.db`).

```bash
git clone https://github.com/4i3n6/opencodeview.git
cd opencodeview
bun install
cd web && bun install && cd ..

bun src/scan.ts --all   # materializa o cache a partir do opencode.db
bun run serve           # API  -> http://127.0.0.1:4317
bun run web             # UI   -> http://127.0.0.1:5273  (proxy de /api)
```

Sobrescrever a fonte:

```bash
OPENCODE_DB=/caminho/opencode.db bun src/scan.ts --all
```

## O que você ganha

- **Overview** — rollups por projeto/global: tokens, tempo ativo, tool calls, flags
- **Efficiency** — tabelas por modelo/agente, intervalos de qualidade, matriz, fronteira
- **Orchestration** — roteamento, profundidade, higiene, árvore de delegação
- **Tools** — taxonomia de uso, classes de erro, duração quando existir
- **Live** — sessões em andamento na fonte (redigidas)
- **Transcript** — navegador paginado de sessão (redigido)
- **i18n** — UI EN-US / PT-BR; IDs de protocolo sem tradução

## Arquitetura

One-pager completo: [docs/ARCHITECTURE.pt-BR.md](docs/ARCHITECTURE.pt-BR.md).

```
opencode.db (fonte, RO)           .cache/analytics.sqlite (cache)
        |                                    ^
        |  scan.ts (escreve só no cache)     |
        +------------------------------------+
                         |
                    server.ts (RO nos dois)
                         |
              /api/*  -->  UI Vite (loopback)
```

Duas conexões SQLite, ambas somente-leitura no engine:

1. **Fonte** (`OPENCODE_DB`) — OpencodeView nunca escreve. Queries pesadas escopadas por projeto com `session_project_idx` / `part_session_idx` quando disponíveis.
2. **Cache** (`OPENCODEVIEW_CACHE`, default `.cache/analytics.sqlite`) — escrito só por `bun src/scan.ts`; a API abre RO.

A maior parte de `/api/*` lê só o cache. Duas rotas leem a fonte em request time (ainda RO + redigidas):

- `GET /api/session/:id/transcript`
- `GET /api/live`

### Superfície da API (resumo)

| Área | Rotas |
|---|---|
| Meta / projects | `/api/meta`, `/api/global`, `/api/projects`, `/api/projects/:id`, `/api/projects/:id/sessions` |
| Session | `/api/session/:id`, `/api/session/:id/transcript` |
| Consumption | `/api/consumption`, `/timeline`, `/summary` |
| Efficiency | `/api/efficiency`, `/quality`, `/matrix`, `/frontier` |
| Orchestration | `/api/orchestration/summary`, `/routing`, `/hygiene`, `/top`, `/tree` |
| Time / quality | `/api/time`, `/api/data-quality` |
| Tools | `/api/tools`, `/api/tools/errors` |
| Live | `/api/live?since_min=180` |

### Métricas de sessão (cache)

Tokens (in/out/reasoning/cache), taxas de tool, `apply_patch_*`, compaction, contagens de parts, latência, `active_min` / bursts (tempo útil por clustering de gaps), `is_subagent` e `flags` CSV.

### Flags

Rótulos heurísticos em sessões no cache. IDs são strings de protocolo estáveis (sem tradução).

| Flag | Regra (derivada localmente dos campos em cache/fonte) |
|---|---|
| `tool_failure_loop` | `tool_calls >= 20` e error rate > 30% |
| `patch_waste` | `patch_count > 50`, `apply_patch_ok = 0`, `summary_additions = 0` |
| `context_pressure` | `compaction_count > 15` |
| `truncation` | ao menos uma mensagem com `finish = length` |
| `omo_metadata_bug` | título da sessão começa com o literal `undefined` |
| `security_anomaly` | título casa heurísticas locais de string (ex.: frases injection-like) |
| `low_yield_high_cost` | >1M tokens, sem additions, sem `apply_patch` ok |
| `data_quality_gap` | mês da sessão cai em janela conhecida de baixa cobertura de `summary_additions` (ver limitações) |

## Defaults de segurança

- Bind: `OPENCODEVIEW_HOST` default `127.0.0.1` (também `localhost` / `::1`). Guards de Host/Origin no loopback.
- Fora do loopback: `OPENCODEVIEW_AUTH_TOKEN` obrigatório ou o startup falha. `/api/*` espera `Authorization: Bearer <token>`.
- Redação (`src/redaction.ts`): chaves de segredo, bearer, prefixos comuns (`sk-`, `ghp-`, …), userinfo em URL, paths absolutos de home → `[REDACTED]`.
- Respostas da API: `Cache-Control: no-store`.
- Sem telemetria / sem rede de saída própria do app.

Expor além do loopback é escolha do operador. Revise a redação contra os seus dados antes.

## Ambiente

| Variável | Default | Propósito |
|---|---|---|
| `OPENCODE_DB` | `~/.local/share/opencode/opencode.db` | DB fonte (RO) |
| `OPENCODEVIEW_CACHE` | `<repo>/.cache/analytics.sqlite` | Cache derivado |
| `OPENCODEVIEW_HOST` | `127.0.0.1` | Bind da API; fora de loopback exige token |
| `OPENCODEVIEW_AUTH_TOKEN` | unset | Bearer para `/api/*` fora de loopback |
| `PORT` | `4317` | Porta da API |
| `OH_MY_OPENCODE_LOG` | `$TMPDIR/oh-my-opencode.log` | Tail opcional de atividade live |

## Comandos

| Comando | O que faz |
|---|---|
| `bun src/scan.ts --list` | Lista barata de projetos |
| `bun src/scan.ts <projeto>` | Escaneia um projeto no cache |
| `bun src/scan.ts --all` | Escaneia tudo |
| `bun run serve` | API em `127.0.0.1:4317` |
| `bun run web` | UI em `127.0.0.1:5273` |
| `bun run check` | Gate completo: test, typecheck, lint, build, audit, Gitleaks |
| `bun run release:check` | Só o harness de release |

Gitleaks é obrigatório em `bun run check` (`gitleaks` no `PATH` ou `GITLEAKS_BIN`).

## Desenvolvimento

```bash
bun run check          # antes de todo PR
bun run test           # root + web
bun run typecheck
bun run lint
bun run build
```

Hooks (Lefthook): Conventional Commits, Gitleaks no staged, harness de release e identidade GitHub exclusiva `4i3n6` no push do maintainer.

Strings de UI em `web/src/i18n` (`en-US` + `pt-BR`). IDs de protocolo, nomes de model/tool, session IDs, flags raw e tab IDs não traduzem. Visual: [DESIGN.pt-BR.md](DESIGN.pt-BR.md).

## Fora de escopo

- Substituir o OpenCode ou publicar UI oficial do OpenCode
- Alegar afiliação ou endosso da equipe do OpenCode
- Analytics cloud / multi-tenant hospedado
- Distribuição em registro npm ou instalador (somente source-run)
- Contrato estável e versionado contra `opencode.db` antes do `1.0.0`

## Limitações conhecidas

- `opencode.db` é detalhe interno de implementação do OpenCode. O adapter é best-effort e pode atrasar mudanças de schema upstream.
- `cost` só é comparável no mesmo regime de billing; alguns modos de auth reportam `0`.
- Em sessões criadas em 2026-06 e 2026-07, a cobertura local de `summary_additions` é incompleta; essas sessões podem receber `data_quality_gap`.
- Sessões legadas com tools `edit`/`write` (não `apply_patch`) não preenchem contadores `apply_patch_*`.
- Espere breaking changes em schema de cache, API e CLI antes do `1.0.0`.

## Contribuindo

Veja [CONTRIBUTING.md](CONTRIBUTING.md). Resumo:

1. Discuta mudanças de segurança (bind, auth, redação, fonte RO) antes de codar.
2. PRs atômicos; Conventional Commits obrigatório.
3. `bun run check` tem que passar.
4. Atualize docs/i18n EN-US + PT-BR quando o comportamento visível mudar.

Vulnerabilidades: só advisory privado — [SECURITY.md](SECURITY.md).  
Dados: [PRIVACY.md](PRIVACY.md).  
Governança: [GOVERNANCE.md](GOVERNANCE.md).  
Conduta: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Licença

[Apache License 2.0](LICENSE) — Copyright 2026 4i3n6.
