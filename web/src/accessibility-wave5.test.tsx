/// <reference types="node" />

import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const SRC_ROOT = new URL(".", import.meta.url);

function source(path: string): string {
  return readFileSync(new URL(path, SRC_ROOT), "utf8");
}

describe("Wave 5 accessibility semantics", () => {
  test("DelegationTree exposes native expand and open-session controls separately", () => {
    const tree = source("components/DelegationTree.tsx");

    expect(tree).toContain('aria-label={open ? t("orchestration.collapseBranch"');
    expect(tree).toContain("aria-expanded={hasKids ? open : undefined}");
    expect(tree).toContain('aria-label={t("common.openSessionNamed"');
    expect(tree).toContain("onClick={() => onOpenSession?.(node.session_id)}");
    expect(tree).not.toContain("onClick={() => onOpenSession?.(node.session_id)}\n      >");
  });

  test("LiveNodeRow owns horizontal overflow and keeps long live details reachable", () => {
    const row = source("components/live/LiveNodeRow.tsx");

    expect(row).toContain("useId");
    expect(row).toContain("const rowScrollHintId = useId();");
    expect(row).toContain("const rowPadding = depth * 18 + 6;");
    expect(row).toContain("w-full min-w-0 overflow-x-auto");
    expect(row).toContain("className=\"flex min-w-max flex-nowrap items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--color-panel-2)]/50\"");
    expect(row).toContain('aria-label={t("live.rowScrollLabel",');
    expect(row).toContain("aria-describedby={rowScrollHintId}");
    expect(row).toContain("<NodeDetail node={node} depth={depth} now={now} describedBy={rowScrollHintId} />");
    expect(row).toContain("overflow-x-auto");
    expect(row).not.toContain("overflow-hidden");
    expect(row).not.toContain('id="live-row-scroll-hint"');
    expect(row).not.toContain('aria-describedby="live-row-scroll-hint"');
  });

  test("LiveLegendPopover trigger exposes localized state and controlled panel", () => {
    const popover = source("components/live/LiveLegendPopover.tsx");

    expect(popover).toContain('aria-label={open ? t("live.closeLegend") : t("live.openLegend")}');
    expect(popover).toContain("aria-expanded={open}");
    expect(popover).toContain('aria-controls="live-legend-popover"');
  });
});

describe("Wave 5 static accessibility contracts", () => {
  test("stateful visual toggles expose aria-pressed in the owning components", () => {
    const contracts = [
      ["components/LiveView.tsx", "aria-pressed={active}"],
      ["components/ConsumptionView.tsx", "aria-pressed={subagentOnly}"],
      ["components/EfficiencyView.tsx", "aria-pressed={subagentOnly}"],
      ["components/ProjectOverview.tsx", "aria-pressed={flaggedOnly}"],
      ["components/ProjectOverview.tsx", 'aria-pressed={order === "tokens"}'],
      ["components/ProjectOverview.tsx", 'aria-pressed={order === "active"}'],
      ["components/OrchestrationView.tsx", "aria-pressed={routingBy === d.key}"],
      ["components/OrchestrationView.tsx", "aria-pressed={timeDim === d.key}"],
      ["components/charts/EfficiencyMatrix.tsx", "aria-pressed={metric === m}"],
    ] as const;

    for (const [path, token] of contracts) {
      expect(source(path)).toContain(token);
    }
  });

  test("LiveLegendPopover implements Escape close and focus return without a popover dependency", () => {
    const popover = source("components/live/LiveLegendPopover.tsx");

    expect(popover).toContain('event.key === "Escape"');
    expect(popover).toContain("setOpen(false)");
    expect(popover).toContain("triggerRef.current?.focus()");
    expect(popover).toContain('role="dialog"');
    expect(popover).toContain('id="live-legend-popover"');
    expect(popover).toContain("max-w-[calc(100vw-2rem)]");
  });

  test("Live attention and tree regions expose labelled internal horizontal scroll owners", () => {
    const liveView = source("components/LiveView.tsx");
    const nodeRow = source("components/live/LiveNodeRow.tsx");
    const delegationTree = source("components/DelegationTree.tsx");

    expect(liveView).toContain('aria-label={t("live.attentionScrollLabel")}');
    expect(liveView).toContain('aria-describedby="live-attention-scroll-hint"');
    expect(liveView).toContain('aria-label={t("live.treeScrollLabel")}');
    expect(nodeRow).toContain('aria-label={t("live.rowScrollLabel",');
    expect(liveView).toContain('t("common.horizontalScrollHint")');
    expect(nodeRow).toContain('t("common.horizontalScrollHint")');
    expect(delegationTree).toContain('t("common.horizontalScrollHint")');
    expect(liveView).not.toContain('t("common.tableScrollHint")');
    expect(nodeRow).not.toContain('t("common.tableScrollHint")');
    expect(delegationTree).not.toContain('t("common.tableScrollHint")');
  });

  test("narrow viewport control groups wrap without changing desktop structure", () => {
    const liveView = source("components/LiveView.tsx");
    const projectOverview = source("components/ProjectOverview.tsx");

    expect(liveView).toContain('className="flex flex-wrap items-center gap-2"');
    expect(projectOverview).toContain('className="flex flex-wrap items-center gap-2"');
  });

  test("reduced motion disables nonessential pulse, ping and transitions", () => {
    const css = source("index.css");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation-duration: 0.01ms");
    expect(css).toContain("transition-duration: 0.01ms");
    expect(css).toContain("animate-pulse");
    expect(css).toContain("animate-ping");
  });
});

describe("Wave 5 chart token discipline", () => {
  test("raw chart hex values stay centralized in the chart color adapter", () => {
    const chartsDir = new URL("components/charts", SRC_ROOT);
    const chartFiles = readdirSync(chartsDir)
      .filter((name) => name.endsWith(".tsx"))
      .map((name) => `components/charts/${name}`);
    const hexPattern = /#[0-9a-fA-F]{6}\b/g;

    expect(chartFiles.length).toBeGreaterThan(0);
    for (const filePath of chartFiles) {
      expect(source(filePath).match(hexPattern) ?? []).toEqual([]);
    }

    expect(source("lib/utils.ts")).not.toContain("COMPOSITION_COLORS");
    expect(source("lib/utils.ts")).not.toContain("CATEGORY_COLORS");
    expect(source("components/charts/chartColors.ts")).toContain("CHART_COLORS");
  });

  test("DESIGN accepted debt points at the TypeScript chart adapter", () => {
    expect(readFileSync(new URL("../../DESIGN.md", SRC_ROOT), "utf8")).toContain("`web/src/components/charts/chartColors.ts`");
    expect(readFileSync(new URL("../../DESIGN.pt-BR.md", SRC_ROOT), "utf8")).toContain("`web/src/components/charts/chartColors.ts`");
  });
});
