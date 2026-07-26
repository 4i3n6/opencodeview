import { describe, expect, mock, test } from "bun:test";
import type { AriaRole, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { translate, type Locale, type MessageKey, type MessageValues } from "../../i18n/catalogs";
import * as realFormat from "../../i18n/format";
import * as realMappings from "../../i18n/mappings";
import * as realFlags from "../../lib/flags";
import type {
  ConsumptionRow,
  ConsumptionTimelineRow,
  EfficiencyFrontierRow,
  OrchestrationDepthRow,
  OrchestrationRoutingRow,
  ProjectRow,
} from "../../lib/api";

let testLocale: Locale = "en-US";

type MockChartProps = {
  readonly children?: ReactNode;
  readonly dataKey?: unknown;
  readonly domain?: unknown;
  readonly fill?: unknown;
  readonly isAnimationActive?: unknown;
  readonly label?: unknown;
  readonly name?: unknown;
  readonly role?: AriaRole;
  readonly stackId?: unknown;
  readonly x1?: unknown;
  readonly x2?: unknown;
};

function chartSeries(series: string, props: MockChartProps): ReactNode {
  return (
    <div
      data-animation-active={String(props.isAnimationActive)}
      data-chart-series={series}
      data-key={props.dataKey == null ? "" : String(props.dataKey)}
      data-name={props.name == null ? "" : String(props.name)}
      data-stack-id={props.stackId == null ? "" : String(props.stackId)}
    >
      {props.children}
    </div>
  );
}

function chartLabelValue(label: unknown): string {
  return typeof label === "object" && label != null && "value" in label ? String(label.value ?? "") : "";
}

function chartDomainValue(domain: unknown): string {
  return Array.isArray(domain) ? domain.map((value) => String(value)).join("..") : "";
}

function extractAttribute(markup: string, attribute: string): string {
  const prefix = `${attribute}="`;
  const start = markup.indexOf(prefix);
  expect(start >= 0).toBe(true);
  const valueStart = start + prefix.length;
  const valueEnd = markup.indexOf('"', valueStart);
  expect(valueEnd > valueStart).toBe(true);
  return markup.slice(valueStart, valueEnd);
}

function setTestLocale(locale: Locale): void {
  testLocale = locale;
}

function formatNumber(value: number | null | undefined): string {
  return value == null ? "-" : String(value);
}

mock.module("@/i18n/context", () => ({
  useI18n: () => ({
    locale: testLocale,
    setLocale: setTestLocale,
    t: (key: MessageKey, values?: MessageValues) => translate(testLocale, key, values),
  }),
}));

mock.module("@/lib/utils", () => ({
  cn: (...classes: readonly (string | false | null | undefined)[]) => classes.filter(Boolean).join(" "),
  fmtDecimal: (value: number | null | undefined) => formatNumber(value),
  fmtDurationS: (value: number | null | undefined) => formatNumber(value),
  fmtHours: (value: number | null | undefined) => formatNumber(value),
  fmtInt: (value: number | null | undefined) => formatNumber(value),
  fmtM: (value: number | null | undefined) => formatNumber(value),
  fmtPct: (value: number | null | undefined) => formatNumber(value),
  wilsonInterval: () => ({ lo: 0, hi: 1 }),
}));

mock.module("@/i18n/format", () => ({
  ...realFormat,
}));

mock.module("@/i18n/mappings", () => ({
  ...realMappings,
}));

mock.module("@/lib/flags", () => ({
  ...realFlags,
}));

mock.module("recharts", () => ({
  Area: (props: MockChartProps) => chartSeries("area", props),
  AreaChart: ({ children, role }: MockChartProps) => <div data-chart="area-chart" role={role}>{children}</div>,
  Bar: (props: MockChartProps) => chartSeries("bar", props),
  BarChart: ({ children, role }: MockChartProps) => <div data-chart="bar-chart" role={role}>{children}</div>,
  CartesianGrid: () => <div data-chart="grid" />,
  Cell: () => <i data-chart-cell="true" />,
  ErrorBar: () => <i data-chart-error-bar="true" />,
  Legend: () => <div data-chart-legend="true" />,
  Pie: (props: MockChartProps) => chartSeries("pie", props),
  PieChart: ({ children, role }: MockChartProps) => <div data-chart="pie-chart" role={role}>{children}</div>,
  ReferenceArea: ({ fill, label, x1, x2 }: MockChartProps) => (
    <i
      data-chart-reference-area={`${String(x1)}..${String(x2)}`}
      data-fill={fill == null ? "" : String(fill)}
      data-reference-label={label == null ? "" : String(label)}
    />
  ),
  ResponsiveContainer: ({ children }: MockChartProps) => <section data-chart="responsive">{children}</section>,
  Scatter: (props: MockChartProps) => chartSeries("scatter", props),
  ScatterChart: ({ children, role }: MockChartProps) => <div data-chart="scatter-chart" role={role}>{children}</div>,
  Tooltip: () => <div data-chart-tooltip="true" />,
  XAxis: ({ dataKey, domain, label }: MockChartProps) => (
    <i data-axis="x" data-domain={chartDomainValue(domain)} data-key={String(dataKey)} data-label={chartLabelValue(label)} />
  ),
  YAxis: ({ dataKey }: MockChartProps) => <i data-axis="y" data-key={String(dataKey)} />,
  ZAxis: ({ dataKey }: MockChartProps) => <i data-axis="z" data-key={String(dataKey)} />,
}));

const { CompositionChart } = await import("./CompositionChart");
const { DepthChart } = await import("./DepthChart");
const { FlagsChart } = await import("./FlagsChart");
const { FrontierScatter } = await import("./FrontierScatter");
const { RoutingChart } = await import("./RoutingChart");
const { StackedDimensionChart } = await import("./StackedDimensionChart");
const { TimelineChart } = await import("./TimelineChart");
const { TokensChart } = await import("./TokensChart");

const consumptionRows: ConsumptionRow[] = [
  {
    key: "model-a",
    sessions: 2,
    msgs: 10,
    tokens_input: 120,
    tokens_output: 60,
    tokens_reasoning: 40,
    tokens_cache_read: 30,
    tokens_cache_write: 5,
    total: 255,
  },
];

const timelineRows: ConsumptionTimelineRow[] = [
  {
    month: "2026-06",
    tokens_input: 120,
    tokens_output: 60,
    tokens_reasoning: 40,
    tokens_cache_read: 30,
    tokens_cache_write: 5,
    total: 255,
  },
  {
    month: "2026-07",
    tokens_input: 80,
    tokens_output: 50,
    tokens_reasoning: 20,
    tokens_cache_read: 10,
    tokens_cache_write: 0,
    total: 160,
  },
];

const frontierRows: EfficiencyFrontierRow[] = [
  {
    model: "model-a",
    sessions: 12,
    tokens_per_session: 120_000,
    tool_error_rate: 0.03,
    apply_patch_precision: 0.92,
    apply_patch_precision_lo: 0.87,
    apply_patch_precision_hi: 0.96,
    rank_lo: 0.87,
  },
  {
    model: "model-b",
    sessions: 8,
    tokens_per_session: 220_000,
    tool_error_rate: 0.08,
    apply_patch_precision: 0.79,
    apply_patch_precision_lo: 0.71,
    apply_patch_precision_hi: 0.85,
    rank_lo: 0.71,
  },
];

const depthRows: OrchestrationDepthRow[] = [
  { spawn_depth: 0, sessions: 3, tokens: 100_000, active_min: 20 },
];

const routingRows: OrchestrationRoutingRow[] = [
  { key: "explore", count: 4, child_tokens: 90_000, avg_duration_s: 32, run_in_background_count: 3, child_adds: 12, child_patch_ok: 2 },
];

const projectRows: ProjectRow[] = [
  { project_id: "project-a", slug: "project-a", sessions: 4, tokens_total: 150_000, scanned_at: 1_788_000_000_000, flagged: 0, active_min: 45 },
];

describe("chart visual contracts", () => {
  test("all production Recharts data series render as static analytical series", () => {
    const html = [
      renderToStaticMarkup(<CompositionChart input={100} output={50} reasoning={25} cache={10} />),
      renderToStaticMarkup(<DepthChart rows={depthRows} />),
      renderToStaticMarkup(<FlagsChart flags={{ patch_waste: 2 }} />),
      renderToStaticMarkup(<FrontierScatter rows={frontierRows} />),
      renderToStaticMarkup(<RoutingChart rows={routingRows} />),
      renderToStaticMarkup(<StackedDimensionChart rows={consumptionRows} />),
      renderToStaticMarkup(<TimelineChart rows={timelineRows} />),
      renderToStaticMarkup(<TokensChart projects={projectRows} />),
    ].join("\n");

    const seriesCount = html.match(/data-chart-series=/g)?.length ?? 0;
    const staticSeriesCount = html.match(/data-animation-active="false"/g)?.length ?? 0;

    expect(seriesCount).toBe(15);
    expect(staticSeriesCount).toBe(seriesCount);
    expect(html).not.toContain('data-animation-active="undefined"');
  });

  test("all production Recharts charts expose localized SVG title and description", () => {
    setTestLocale("en-US");
    const english = [
      renderToStaticMarkup(<CompositionChart input={100} output={50} reasoning={25} cache={10} />),
      renderToStaticMarkup(<DepthChart rows={depthRows} />),
      renderToStaticMarkup(<FlagsChart flags={{ patch_waste: 2 }} />),
      renderToStaticMarkup(<FrontierScatter rows={frontierRows} />),
      renderToStaticMarkup(<RoutingChart rows={routingRows} />),
      renderToStaticMarkup(<StackedDimensionChart rows={consumptionRows} title={translate("en-US", "consumption.byModel")} />),
      renderToStaticMarkup(<TimelineChart rows={timelineRows} />),
      renderToStaticMarkup(<TokensChart projects={projectRows} />),
    ].join("\n");

    setTestLocale("pt-BR");
    const portuguese = renderToStaticMarkup(<TokensChart projects={projectRows} />);

    expect(english.match(/role="img"/g)?.length ?? 0).toBe(8);
    expect(english.match(/<title>/g)?.length ?? 0).toBe(8);
    expect(english.match(/<desc>/g)?.length ?? 0).toBe(8);
    expect(english).toContain(translate("en-US", "chart.tokensByProjectDesc"));
    expect(english).toContain(translate("en-US", "chart.frontierDesc"));
    expect(portuguese).toContain(translate("pt-BR", "chart.tokensByProjectDesc"));
  });

  test("FrontierScatter renders localized directional annotations in normal-flow bands", () => {
    setTestLocale("en-US");
    const english = renderToStaticMarkup(<FrontierScatter rows={frontierRows} />);

    setTestLocale("pt-BR");
    const portuguese = renderToStaticMarkup(<FrontierScatter rows={frontierRows} />);

    expect(english).toContain('data-frontier-annotation-band="better"');
    expect(english).toContain('data-frontier-annotation-band="worse"');
    expect(english).toContain("more efficient (cheap + precise)");
    expect(portuguese).toContain("mais eficiente (barato + preciso)");
    expect(portuguese).toContain("mais caro / precisão de patch indisponível");
    expect(english.indexOf('data-frontier-annotation-band="better"') < english.indexOf("top 18 models")).toBe(true);
    expect(english).not.toContain("absolute");
    expect(portuguese).not.toContain("absolute");
  });

  test("FrontierScatter renders a positive log-safe X domain with headroom around positive data", () => {
    const html = renderToStaticMarkup(<FrontierScatter rows={frontierRows} />);
    const domain = extractAttribute(html, "data-domain");
    const [lowerRaw, upperRaw] = domain.split("..");
    if (lowerRaw == null || upperRaw == null) throw new Error("Frontier domain must render two bounds");
    const [lower, upper] = [Number(lowerRaw), Number(upperRaw)];
    expect(Number.isFinite(lower)).toBe(true);
    expect(Number.isFinite(upper)).toBe(true);
    expect(lower > 0).toBe(true);
    expect(lower < 120_000).toBe(true);
    expect(upper > 220_000).toBe(true);
  });

  test("DepthChart localizes delegation depth axis label without exposing spawn_depth", () => {
    setTestLocale("en-US");
    const english = renderToStaticMarkup(<DepthChart rows={depthRows} />);

    setTestLocale("pt-BR");
    const portuguese = renderToStaticMarkup(<DepthChart rows={depthRows} />);

    expect(english).toContain('data-axis="x"');
    expect(english).toContain('data-key="depth"');
    expect(english).toContain('data-label="Delegation depth"');
    expect(english).not.toContain("spawn_depth");
    expect(portuguese).toContain('data-label="Profundidade"');
    expect(portuguese).not.toContain("spawn_depth");
  });

  test("TimelineChart keeps gap shading semantic and moves the localized gap legend outside the plot", () => {
    setTestLocale("en-US");
    const english = renderToStaticMarkup(<TimelineChart rows={timelineRows} />);

    setTestLocale("pt-BR");
    const portuguese = renderToStaticMarkup(<TimelineChart rows={timelineRows} />);

    expect(english).toContain('data-chart-gap-legend="true"');
    expect(english).toContain("data quality gap");
    expect(portuguese).toContain('data-chart-gap-legend="true"');
    expect(portuguese).toContain("lacuna de qualidade dos dados");
    expect(portuguese).toContain("text-[var(--color-warn)]");
    expect(portuguese).toContain('data-chart-reference-area="2026-06..2026-07"');
    expect(portuguese).toContain('data-reference-label=""');
  });
});
