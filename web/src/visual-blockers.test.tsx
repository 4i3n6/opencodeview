/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { translate, type Locale, type MessageKey, type MessageValues } from "./i18n/catalogs";
import type { LiveNode } from "./lib/api/live";
import type { DataQualityRow } from "./lib/api/time-quality";
import * as realUtils from "./lib/utils";

const SRC_ROOT = new URL(".", import.meta.url);

let testLocale: Locale = "en-US";

const dataQualityRows: readonly DataQualityRow[] = [
  { field: "title", month: "2026-05", coverage: 0.25, is_gap: 0 },
  { field: "title", month: "2026-06", coverage: 0.25, is_gap: 1 },
];

let liveNodes: readonly LiveNode[] = [];

type MockChartProps = {
  readonly children?: ReactNode;
  readonly dataKey?: unknown;
  readonly fill?: unknown;
  readonly isAnimationActive?: unknown;
  readonly label?: unknown;
  readonly name?: unknown;
  readonly stackId?: unknown;
  readonly payload?: readonly { readonly value?: unknown }[];
  readonly x1?: unknown;
  readonly x2?: unknown;
};

function source(path: string): string {
  return readFileSync(new URL(path, SRC_ROOT), "utf8");
}

function setTestLocale(locale: Locale): void {
  testLocale = locale;
}

mock.module("@/i18n/context", () => ({
  useI18n: () => ({
    locale: testLocale,
    setLocale: setTestLocale,
    t: (key: MessageKey, values?: MessageValues) => translate(testLocale, key, values),
  }),
}));

mock.module("@/lib/api", () => ({
  LIVE_REFRESH_INTERVAL_MS: 10_000,
  useDataQuality: () => ({ data: dataQualityRows, isLoading: false }),
  useLive: () => ({ data: { generated_at: 1_788_000_000_000, since_min: 180, nodes: liveNodes }, isFetching: false }),
}));

mock.module("./components/live/LiveNodeRow", () => ({
  LiveNodeRow: ({ node }: { readonly node: LiveNode }) => <div data-live-node={node.session_id}>{node.title}</div>,
}));

mock.module("./components/live/LiveLegendPopover", () => ({
  LiveLegendPopover: () => <button type="button">legend</button>,
}));

mock.module("@/components/InfoBadge", () => ({
  InfoBadge: () => <span data-info-badge="true" />,
}));

mock.module("@/components/PanelStatus", () => ({
  PanelStatus: ({ kind = "loading" }: { readonly kind?: "loading" | "empty" | "error" }) => <div role={kind === "error" ? "alert" : "status"}>{kind}</div>,
}));

mock.module("@/components/ui/card", () => ({
  Card: ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => <section className={className}>{children}</section>,
  CardContent: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => <header className={className}>{children}</header>,
  CardTitle: ({ children, className }: { readonly children: ReactNode; readonly className?: string }) => <h2 className={className}>{children}</h2>,
}));

mock.module("@/components/ui/badge", () => ({
  Badge: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
}));

mock.module("@/components/ui/table", () => ({
  TableScrollContainer: ({ children, hint, label }: { readonly children: ReactNode; readonly hint: string; readonly label: string }) => (
    <div tabIndex={0} aria-label={label} aria-describedby="mock-table-scroll-hint">
      <div id="mock-table-scroll-hint">{hint}</div>
      {children}
    </div>
  ),
}));

mock.module("@/lib/utils", () => ({
  ...realUtils,
}));

mock.module("@/lib/flags", () => ({
  flagMeta: () => ({ labelKey: "flag.patch_waste.label", descriptionKey: "flag.patch_waste.description", tone: "warn" }),
}));

mock.module("recharts", () => ({
  Area: (props: MockChartProps) => (
    <div data-animation-active={String(props.isAnimationActive)} data-chart-series="area" data-key={String(props.dataKey)} data-name={props.name == null ? "" : String(props.name)} data-stack-id={props.stackId == null ? "" : String(props.stackId)}>
      {props.children}
    </div>
  ),
  AreaChart: ({ children }: MockChartProps) => <div data-chart="area-chart">{children}</div>,
  Bar: ({ children, dataKey, isAnimationActive, name, stackId }: MockChartProps) => (
    <div data-animation-active={String(isAnimationActive)} data-chart-bar={String(dataKey)} data-chart-series="bar" data-key={String(dataKey)} data-name={name == null ? "" : String(name)} data-stack-id={stackId == null ? "" : String(stackId)}>
      {children}
    </div>
  ),
  BarChart: ({ children }: MockChartProps) => <div data-chart="bar-chart">{children}</div>,
  CartesianGrid: () => <div data-chart="grid" />,
  Cell: ({ dataKey }: MockChartProps) => <i data-chart-cell={String(dataKey)} />,
  ErrorBar: () => <i data-chart-error-bar="true" />,
  Legend: ({ payload }: MockChartProps) => (
    <div data-chart-legend="true">{(payload ?? []).map((item) => String(item.value)).join(" ")}</div>
  ),
  Pie: (props: MockChartProps) => (
    <div data-animation-active={String(props.isAnimationActive)} data-chart-series="pie" data-key={String(props.dataKey)} data-name={props.name == null ? "" : String(props.name)} data-stack-id={props.stackId == null ? "" : String(props.stackId)}>
      {props.children}
    </div>
  ),
  PieChart: ({ children }: MockChartProps) => <div data-chart="pie-chart">{children}</div>,
  ReferenceArea: ({ fill, label, x1, x2 }: MockChartProps) => (
    <i
      data-chart-reference-area={`${String(x1)}..${String(x2)}`}
      data-fill={fill == null ? "" : String(fill)}
      data-reference-label={label == null ? "" : String(label)}
    />
  ),
  ResponsiveContainer: ({ children }: MockChartProps) => <section data-chart="responsive">{children}</section>,
  Scatter: (props: MockChartProps) => (
    <div data-animation-active={String(props.isAnimationActive)} data-chart-series="scatter" data-key={String(props.dataKey)} data-name={props.name == null ? "" : String(props.name)} data-stack-id={props.stackId == null ? "" : String(props.stackId)}>
      {props.children}
    </div>
  ),
  ScatterChart: ({ children }: MockChartProps) => <div data-chart="scatter-chart">{children}</div>,
  Tooltip: () => <div data-chart-tooltip="true" />,
  XAxis: ({ dataKey }: MockChartProps) => <i data-axis="x" data-key={String(dataKey)} />,
  YAxis: ({ dataKey }: MockChartProps) => <i data-axis="y" data-key={String(dataKey)} />,
  ZAxis: ({ dataKey }: MockChartProps) => <i data-axis="z" data-key={String(dataKey)} />,
}));

const { DataQualityView } = await import("./components/DataQualityView");
const { FlagsChart } = await import("./components/charts/FlagsChart");
const { LiveView } = await import("./components/LiveView");
const { StackedDimensionChart } = await import("./components/charts/StackedDimensionChart");

function liveNode(sessionId: string): LiveNode {
  return {
    session_id: sessionId,
    project_id: "project-1",
    project_slug: "project",
    parent_id: null,
    title: `Session ${sessionId}`,
    agent: null,
    model: null,
    time_created: 1_788_000_000_000,
    time_updated: 1_788_000_000_000,
    tokens: 0,
    tool_calls: 0,
    tool_errors: 0,
    last_tool_name: null,
    last_tool_title: null,
    last_tool_at: null,
    last_text_snippet: null,
    last_text_at: null,
    is_complete: false,
    log_status: null,
    log_elapsed_s: null,
    log_inactive_s: null,
    log_tool_calls: null,
    log_last_seen_at: null,
    terminal_event: null,
    last_real_activity_at: 1_788_000_000_000,
    health: "green",
  };
}

describe("verified visual blocker contracts", () => {
  test("DataQualityView marks only known gaps as bad and supplements color with text", () => {
    setTestLocale("en-US");

    const html = renderToStaticMarkup(<DataQualityView />);

    expect(html).toContain("known gap");
    expect(html).toContain("var(--color-bad)_35%");
    expect(html).not.toContain("var(--color-bad)_20%");
    expect(html).toContain("var(--color-warn)");
  });

  test("shared table scroll owner exposes overflow-gated focus and localized scroll affordance", async () => {
    const tableSource = readFileSync(new URL("./components/ui/table.tsx", import.meta.url), "utf8");
    const tableModule: typeof import("./components/ui/table") & {
      readonly TableScrollContainer?: (props: {
        readonly label: string;
        readonly hint: string;
        readonly children: ReactNode;
      }) => ReactNode;
    } = await import("./components/ui/table");

    expect(typeof tableModule.TableScrollContainer).toBe("function");
    expect(tableSource).toContain("scrollWidth > el.clientWidth");
    expect(tableSource).toContain("tabIndex={overflowsX ? 0 : undefined}");
    expect(tableSource).toContain('t("common.tableScrollHint")');

    if (typeof tableModule.TableScrollContainer !== "function") return;

    const html = renderToStaticMarkup(
      <tableModule.TableScrollContainer label="Coverage table" hint={translate("en-US", "common.tableScrollHint")}>
        <table>
          <tbody>
            <tr>
              <td>cell</td>
            </tr>
          </tbody>
        </table>
      </tableModule.TableScrollContainer>,
    );

    // Static markup has no measured overflow yet, so the container must not
    // become a keyboard focus trap before horizontal scroll is needed.
    expect(html).not.toContain('tabindex="0"');
    expect(html).toContain("overflow-auto");
  });

  test("stacked token composition chart exposes localized series names and a textual legend", () => {
    setTestLocale("pt-BR");

    const html = renderToStaticMarkup(
      <StackedDimensionChart
        rows={[
          {
            key: "claude",
            sessions: 1,
            msgs: 2,
            tokens_input: 100,
            tokens_output: 50,
            tokens_reasoning: 25,
            tokens_cache_read: 10,
            tokens_cache_write: 0,
            total: 185,
          },
        ]}
      />,
    );

    expect(html).toContain('data-chart-legend="true"');
    expect(html).toContain('data-name="entrada"');
    expect(html).toContain('data-name="saída"');
    expect(html).toContain('data-name="raciocínio"');
    expect(html).toContain('data-name="cache (reuso)"');
  });

  test("flags chart gives count a localized series name for default tooltip content", () => {
    setTestLocale("pt-BR");

    const html = renderToStaticMarkup(<FlagsChart flags={{ patch_waste: 3 }} />);

    expect(html).toContain('data-chart-bar="count"');
    expect(html).toContain('data-name="Contagem"');
  });

  test("button solid variant uses the declared background token instead of raw hex text color", () => {
    const buttonSource = source("components/ui/button.tsx");

    expect(buttonSource).toContain("text-[var(--color-bg)]");
    expect(buttonSource).not.toContain("text-[#0a0b0f]");
  });

  test("Live 375 quiet status keeps the short title atomic while body text can wrap", () => {
    const liveSource = source("components/LiveView.tsx");

    expect(liveSource).toContain('className="whitespace-nowrap"');
    expect(liveSource).toContain("sm:flex-row");
    expect(liveSource).toContain('className="min-w-0 text-xs text-[var(--color-muted)]"');
  });

  test("LiveView renders singular and plural root summaries in English and Portuguese", () => {
    liveNodes = [liveNode("root-1")];
    setTestLocale("en-US");
    expect(renderToStaticMarkup(<LiveView />)).toContain("Live sessions and tasks (1 root)");

    setTestLocale("pt-BR");
    expect(renderToStaticMarkup(<LiveView />)).toContain("Sessões e tarefas ao vivo (1 raiz)");

    liveNodes = [liveNode("root-1"), liveNode("root-2")];
    setTestLocale("en-US");
    expect(renderToStaticMarkup(<LiveView />)).toContain("Live sessions and tasks (2 roots)");

    setTestLocale("pt-BR");
    expect(renderToStaticMarkup(<LiveView />)).toContain("Sessões e tarefas ao vivo (2 raízes)");
  });
});
