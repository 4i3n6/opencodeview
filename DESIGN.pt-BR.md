# OpencodeView Design System

[English](DESIGN.md) · **Português**

## 1. Atmosphere & Identity

OpencodeView é um command center analítico local: denso, sóbrio, operacional
e privado. A assinatura visual é a hierarquia por camadas tonais em dark
mode, com números tabulares, cartões compactos e cor reservada para
métricas, estados e séries de dados, nunca para decoração.

## 2. Color

### Palette

| Role | Token | Value | Usage |
|---|---|---|---|
| Surface/base | `--color-bg` | `#0a0b0f` | Fundo do documento e blocos de código |
| Surface/panel | `--color-panel` | `#12141c` | Cards, selects, tooltips e painéis |
| Surface/raised | `--color-panel-2` | `#171a24` | Headers de tabela, hover, subpainéis |
| Border/default | `--color-border` | `#232735` | Divisores, outlines, limites de scroll |
| Text/muted | `--color-muted` | `#8b93a7` | Labels, captions, eixo de gráficos |
| Text/primary | `--color-fg` | `#e6e9f0` | Conteúdo principal |
| Accent/interactive | `--color-accent` | `#6ea8fe` | Botão ativo, foco, link/ação primária, série primária |
| Status/success | `--color-good` | `#34d399` | Saúde boa, precisão, sucesso |
| Status/warning | `--color-warn` | `#fbbf24` | Atenção, lacuna, risco moderado |
| Status/error | `--color-bad` | `#f87171` | Erro, suspeita, falha |
| Series/secondary | `--color-purple` | `#a78bfa` | Subagentes, tempo, série secundária |

### Categorical Chart Palette

| Role | Adapter key | Value | Usage |
|---|---|---|---|
| Category/cyan | `categoryCyan` | `#22d3ee` | Séries categóricas excedentes em charts |
| Category/pink | `categoryPink` | `#f472b6` | Séries categóricas excedentes em charts |
| Category/lime | `categoryLime` | `#84cc16` | Séries categóricas excedentes em charts |
| Category/orange | `categoryOrange` | `#fb923c` | Séries categóricas excedentes em charts |
| Category/indigo | `categoryIndigo` | `#818cf8` | Séries categóricas excedentes em charts |

### Rules

- O tema padrão é dark. Light mode não existe no baseline atual.
- Cor só representa interação, série de dado ou estado semântico.
- Hex direto fora de tokens deve permanecer restrito ao adapter de cores de
  chart para integrações que ainda não aceitam CSS variables de forma
  confiável; se usado, precisa corresponder a tokens destas tabelas.
- IDs de protocolo, nomes de modelos, ferramentas, sessões, providers, flags
  cruas desconhecidas e tab IDs canônicos não são traduzidos.

## 3. Typography

### Scale

| Level | Class/size | Weight | Usage |
|---|---|---|---|
| Page title | `text-xl` | 600 | Marca no shell |
| Section title | `text-lg` | 600 | Títulos de projeto/sessão |
| Card title | `text-sm` | 500 | Cabeçalhos de card |
| Body/table | `text-sm` | 400/500 | Tabelas, controles e descrições |
| Caption | `text-xs` | 400/500 | Hints, legends, metadados |
| Micro label | `text-[10px]` | 400/500 | Badges densos, labels internos de transcript |
| Mono/code | `font-mono text-[11px]` | 400 | Payloads de ferramenta e caminhos |

### Font Stack

- Primary: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Mono: stack padrão do Tailwind `font-mono`.
- Todo o documento ativa `font-feature-settings: "tnum" 1`; células e KPIs
  reforçam `tabular-nums`.

## 4. Spacing & Layout

### Base Unit

O ritmo visual é denso e segue base de 4px com preferência por múltiplos de
8px em conteúdo analítico.

| Token/Class | Value | Usage |
|---|---|---|
| `gap-1` / `p-1` | 4px | Ícones, controles internos |
| `gap-2` / `px-2` / `py-2` | 8px | Tabelas, badges, filtros compactos |
| `gap-3` / `px-3` | 12px | KPI grids, células, tool rows |
| `gap-4` / `p-4` | 16px | Cards, seções e shell mobile |
| `md:p-6` | 24px | Shell em tablet/desktop |
| `max-w-[1400px]` | 1400px | Largura máxima do produto |

### Grid and Responsive Behavior

- Breakpoints de referência: 375px, 768px, 1280px.
- O documento principal nunca deve gerar overflow horizontal nesses
  breakpoints.
- O shell possui wrap ou scroll interno visível na navegação; tabelas e
  árvores são donas do overflow horizontal quando o conteúdo é
  intrinsecamente largo.
- Desktop preserva densidade: sem transformar tabelas analíticas em cards
  empilhados.

## 5. Components

### App Shell

- **Structure**: container `max-w-[1400px]`, header com marca, navegação
  tabular, metadados e seletor de locale.
- **States**: tab ativa `solid`, tabs inativas `ghost`, foco visível por
  token de accent.
- **Accessibility**: `<nav aria-label>`, botões com `aria-current`, locale
  selector com label, document title localizado.
- **Layout**: shell é scroll owner vertical; nav pode envolver ou usar
  scroll horizontal interno em viewport estreita.

### Button

- **Variants**: `solid`, `ghost`, `outline` via CVA.
- **Spacing**: `h-8/h-9`, `px-3/px-4`, `gap-1.5`.
- **States**: hover tonal, disabled opacity, focus ring com accent.
- **Accessibility**: ícone-only exige `aria-label` localizado.

### Card

- **Structure**: `Card`, `CardHeader`, `CardTitle`, `CardContent`.
- **Spacing**: header `px-4 pt-4 pb-2`, content `px-4 pb-4`.
- **Depth**: painel tonal com borda; sombra atual é sutil e aceita como
  dívida por já estar no baseline.

### Badge and InfoBadge

- **Variants**: neutral, good, warn, bad, accent, purple.
- **Usage**: taxonomia analítica, estado, flag e escopo informacional.
- **Accessibility**: label textual sempre presente; cor nunca é o único
  canal.

### Table

- **Structure**: wrapper com borda e overflow, `thead` tonal, células
  `px-3 py-2 whitespace-nowrap`.
- **States**: hover row; sortable header deve conter `button` e `aria-sort`.
- **Accessibility**: linha clicável deve ser botão/link semântico ou possuir
  keyboard handler e foco visível.
- **Layout**: tabela é dona do scroll horizontal e deve expor affordance
  textual/visual quando houver overflow.

### Charts

- **Structure**: Recharts com `ResponsiveContainer`, eixos muted e paleta
  tokenizada.
- **States**: loading/empty fora do gráfico; tooltip deve usar tokens do
  painel.
- **Accessibility**: títulos, legends, axes e tooltips localizados; séries
  continuam identificáveis por texto.

### Transcript Parts

- **Structure**: partes text/reasoning/tool/patch/file/step/subtask têm
  labels tipados.
- **States**: truncado, collapsed/expanded, erro de ferramenta e status
  desconhecido.
- **Accessibility**: toggles são botões com nome acessível; payloads usam
  scroll próprio.

## 6. Motion & Interaction

- Motion é operacional e mínimo: `transition-colors`, hover tonal,
  pulse/ping apenas para estado live observado.
- Não adicionar motion decorativo.
- Animações existentes devem respeitar o sentido do estado: green health
  pulse é label ativo; ring accent indica progresso real observado.
- `prefers-reduced-motion` deve poder desligar animações não essenciais
  quando o baseline evoluir.

## 7. Depth & Surface

Estratégia: tonal shift + borda hairline. `--color-bg`, `--color-panel` e
`--color-panel-2` criam camadas. Bordas delimitam regiões densas e scroll
owners. Sombras não são mecanismo primário.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Alvo: WCAG 2.2 AA.
- Contraste mínimo: 4.5:1 para texto normal, 3:1 para texto grande e
  componentes gráficos essenciais.
- Todo controle interativo precisa ser teclado-alcançável, ter nome
  acessível e estado/foco visível.
- Sortables usam botões e `aria-sort`; rows acionáveis usam semântica de
  botão/link ou teclado equivalente.
- Ícones sem texto precisam de `aria-label` localizado; ícones decorativos
  usam `aria-hidden`.
- Strings visíveis e formatos sensíveis a locale saem do catálogo tipado,
  exceto identificadores de protocolo e valores crus desconhecidos.

### Accepted Debt

| Item | Location | Why accepted | Exit |
|---|---|---|---|
| Visual QA final integrada | Browser QA | Backend integrado e dados sintéticos finais são executados pelo processo pai | Revalidar 375/768/1280 após backend |
| Alguns hex em charts | `web/src/components/charts/chartColors.ts` | Recharts `contentStyle`/series nem sempre aceitam CSS variables com type safety uniforme | Manter valores crus de chart confinados ao adapter |
