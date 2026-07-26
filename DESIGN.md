# OpencodeView Design System

**English** · [Português](DESIGN.pt-BR.md)

## 1. Atmosphere & Identity

OpencodeView is a local analytical command center: dense, sober, operational,
and private. Its visual signature is a hierarchy of tonal layers in dark
mode, with tabular numbers, compact cards, and color reserved for metrics,
states, and data series — never for decoration.

## 2. Color

### Palette

| Role | Token | Value | Usage |
|---|---|---|---|
| Surface/base | `--color-bg` | `#0a0b0f` | Document background and code blocks |
| Surface/panel | `--color-panel` | `#12141c` | Cards, selects, tooltips, and panels |
| Surface/raised | `--color-panel-2` | `#171a24` | Table headers, hover, subpanels |
| Border/default | `--color-border` | `#232735` | Dividers, outlines, scroll boundaries |
| Text/muted | `--color-muted` | `#8b93a7` | Labels, captions, chart axes |
| Text/primary | `--color-fg` | `#e6e9f0` | Main content |
| Accent/interactive | `--color-accent` | `#6ea8fe` | Active button, focus, link/primary action, primary series |
| Status/success | `--color-good` | `#34d399` | Good health, precision, success |
| Status/warning | `--color-warn` | `#fbbf24` | Attention, gap, moderate risk |
| Status/error | `--color-bad` | `#f87171` | Error, suspicion, failure |
| Series/secondary | `--color-purple` | `#a78bfa` | Subagents, time, secondary series |

### Categorical Chart Palette

| Role | Adapter key | Value | Usage |
|---|---|---|---|
| Category/cyan | `categoryCyan` | `#22d3ee` | Overflow categorical chart series |
| Category/pink | `categoryPink` | `#f472b6` | Overflow categorical chart series |
| Category/lime | `categoryLime` | `#84cc16` | Overflow categorical chart series |
| Category/orange | `categoryOrange` | `#fb923c` | Overflow categorical chart series |
| Category/indigo | `categoryIndigo` | `#818cf8` | Overflow categorical chart series |

### Rules

- The default theme is dark. There is no light mode in the current baseline.
- Color only represents interaction, a data series, or a semantic state.
- Raw hex values outside the token set must stay restricted to the chart
  color adapter for integrations that do not yet reliably accept CSS
  variables; if used, they must match a token from these tables.
- Protocol IDs, model names, tools, sessions, providers, unknown raw flag
  values, and canonical tab IDs are not translated.

## 3. Typography

### Scale

| Level | Class/size | Weight | Usage |
|---|---|---|---|
| Page title | `text-xl` | 600 | Brand in the shell |
| Section title | `text-lg` | 600 | Project/session titles |
| Card title | `text-sm` | 500 | Card headers |
| Body/table | `text-sm` | 400/500 | Tables, controls, and descriptions |
| Caption | `text-xs` | 400/500 | Hints, legends, metadata |
| Micro label | `text-[10px]` | 400/500 | Dense badges, internal transcript labels |
| Mono/code | `font-mono text-[11px]` | 400 | Tool payloads and paths |

### Font Stack

- Primary: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Mono: Tailwind's default `font-mono` stack.
- The whole document enables `font-feature-settings: "tnum" 1`; table cells
  and KPIs additionally use `tabular-nums`.

## 4. Spacing & Layout

### Base Unit

The visual rhythm is dense, following a 4px base with a preference for
multiples of 8px in analytical content.

| Token/Class | Value | Usage |
|---|---|---|
| `gap-1` / `p-1` | 4px | Icons, internal controls |
| `gap-2` / `px-2` / `py-2` | 8px | Tables, badges, compact filters |
| `gap-3` / `px-3` | 12px | KPI grids, cells, tool rows |
| `gap-4` / `p-4` | 16px | Cards, sections, and mobile shell |
| `md:p-6` | 24px | Shell on tablet/desktop |
| `max-w-[1400px]` | 1400px | Maximum product width |

### Grid and Responsive Behavior

- Reference breakpoints: 375px, 768px, 1280px.
- The main document must never produce horizontal overflow at these
  breakpoints.
- The shell has wrap or visible internal scroll in navigation; tables and
  trees own horizontal overflow when their content is intrinsically wide.
- Desktop preserves density: analytical tables are never turned into
  stacked cards.

## 5. Components

### App Shell

- **Structure**: `max-w-[1400px]` container, header with brand, tabular
  navigation, metadata, and locale selector.
- **States**: active tab is `solid`, inactive tabs are `ghost`, focus visible
  via the accent token.
- **Accessibility**: `<nav aria-label>`, buttons with `aria-current`, locale
  selector with a label, localized document title.
- **Layout**: the shell is the vertical scroll owner; nav can wrap or use
  internal horizontal scroll in narrow viewports.

### Button

- **Variants**: `solid`, `ghost`, `outline` via CVA.
- **Spacing**: `h-8/h-9`, `px-3/px-4`, `gap-1.5`.
- **States**: tonal hover, disabled opacity, accent focus ring.
- **Accessibility**: icon-only buttons require a localized `aria-label`.

### Card

- **Structure**: `Card`, `CardHeader`, `CardTitle`, `CardContent`.
- **Spacing**: header `px-4 pt-4 pb-2`, content `px-4 pb-4`.
- **Depth**: tonal panel with border; current shadow is subtle and accepted
  as debt since it was already in the baseline.

### Badge and InfoBadge

- **Variants**: neutral, good, warn, bad, accent, purple.
- **Usage**: analytical taxonomy, state, flag, and informational scope.
- **Accessibility**: a text label is always present; color is never the only
  channel.

### Table

- **Structure**: wrapper with border and overflow, tonal `thead`, cells
  `px-3 py-2 whitespace-nowrap`.
- **States**: row hover; sortable headers must contain a `button` and
  `aria-sort`.
- **Accessibility**: a clickable row must be a semantic button/link or have
  a keyboard handler and visible focus.
- **Layout**: the table owns horizontal scroll and must expose a
  textual/visual affordance when there is overflow.

### Charts

- **Structure**: Recharts with `ResponsiveContainer`, muted axes, and a
  tokenized palette.
- **States**: loading/empty states live outside the chart; tooltips use
  panel tokens.
- **Accessibility**: titles, legends, axes, and tooltips are localized;
  series remain identifiable by text.

### Transcript Parts

- **Structure**: text/reasoning/tool/patch/file/step/subtask parts have
  typed labels.
- **States**: truncated, collapsed/expanded, tool error, and unknown status.
- **Accessibility**: toggles are buttons with an accessible name; payloads
  use their own scroll.

## 6. Motion & Interaction

- Motion is operational and minimal: `transition-colors`, tonal hover,
  pulse/ping only for observed live state.
- No decorative motion should be added.
- Existing animations must respect the meaning of the state: the green
  health pulse is an active label; the accent ring indicates real observed
  progress.
- `prefers-reduced-motion` should be able to disable non-essential
  animations as the baseline evolves.

## 7. Depth & Surface

Strategy: tonal shift + hairline border. `--color-bg`, `--color-panel`, and
`--color-panel-2` create layers. Borders delimit dense regions and scroll
owners. Shadows are not the primary mechanism.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target: WCAG 2.2 AA.
- Minimum contrast: 4.5:1 for normal text, 3:1 for large text and essential
  graphical components.
- Every interactive control must be keyboard-reachable, have an accessible
  name, and a visible state/focus.
- Sortables use buttons and `aria-sort`; actionable rows use button/link
  semantics or an equivalent keyboard interaction.
- Icons without text need a localized `aria-label`; decorative icons use
  `aria-hidden`.
- Visible strings and locale-sensitive formats live in the typed catalog,
  except for protocol identifiers and unknown raw values.

### Accepted Debt

| Item | Location | Why accepted | Exit |
|---|---|---|---|
| Final visual QA integration | Browser QA | Backend integration and final synthetic data are run by the parent process | Revalidate 375/768/1280 after backend |
| Some hex values in charts | `web/src/components/charts/chartColors.ts` | Recharts `contentStyle`/series don't always accept CSS variables with uniform type safety | Keep raw chart values confined to the adapter |
