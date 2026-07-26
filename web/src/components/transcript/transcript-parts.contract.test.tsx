import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { translate, type Locale, type MessageKey, type MessageValues } from "../../i18n/catalogs";
import * as realMappings from "../../i18n/mappings";

mock.module("@/components/ui/badge", () => ({
  Badge: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
}));

mock.module("@/i18n/context", () => ({
  useI18n: () => ({
    locale: "en-US",
    setLocale: () => {},
    t: (key: MessageKey, values?: MessageValues) => translate("en-US", key, values),
  }),
}));

mock.module("@/i18n/mappings", () => ({
  ...realMappings,
  TOOL_STATUS_LABEL_KEYS: {
    completed: "toolStatus.completed",
    success: "toolStatus.success",
    ok: "toolStatus.ok",
    error: "toolStatus.error",
    failed: "toolStatus.failed",
    failure: "toolStatus.failure",
    running: "toolStatus.running",
    pending: "toolStatus.pending",
    unknown: "toolStatus.unknown",
  },
  TRANSCRIPT_PART_LABEL_KEYS: {
    patch: "transcript.part.patch",
    "step-finish": "transcript.part.step-finish",
    "step-start": "transcript.part.step-start",
    compaction: "transcript.part.compaction",
    agent: "transcript.part.agent",
  },
  isKnownToolStatus: (status: string) => ["completed", "success", "ok", "error", "failed", "failure", "running", "pending", "unknown"].includes(status),
}));

mock.module("@/lib/utils", () => ({
  fmtDurationS: (value: number | null | undefined) => `${value ?? 0}s`,
}));

const { MessagePartView, ReasoningPart } = await import("./MessagePart");
const { SubtaskPart } = await import("./SubtaskPart");
const { ToolPart } = await import("./ToolPart");

function renderWithI18n(node: ReactNode, locale: Locale = "en-US"): string {
  if (locale !== "en-US") throw new Error("test renderer only supports en-US");
  return renderToStaticMarkup(node);
}

function controlIds(html: string): string[] {
  return Array.from(html.matchAll(/aria-controls="([^"]+)"/g), (match) => match[1] ?? "");
}

describe("transcript tool payload rendering", () => {
  test("renders structured input, output and error values as formatted text when expanded", () => {
    const html = renderWithI18n(
      <ToolPart
        tool="probe"
        status="error"
        input={{ path: "/tmp/source", retry: false }}
        output={{ rows: [{ id: "row-1", ok: true }] }}
        error={{ code: "E_STRUCTURED", detail: { retryable: false } }}
        defaultOpen={true}
      />,
    );

    expect(html).toContain('&quot;path&quot;: &quot;/tmp/source&quot;');
    expect(html).toContain('&quot;rows&quot;: [');
    expect(html).toContain('&quot;code&quot;: &quot;E_STRUCTURED&quot;');
  });
});

describe("transcript disclosure accessibility", () => {
  test("reasoning, tool and subtask controls expose collapsed state with stable panel targets", () => {
    const html = renderWithI18n(
      <>
        <MessagePartView part={{ type: "reasoning", text: "hidden reasoning" }} />
        <ToolPart tool="probe" input="{}" />
        <SubtaskPart agent="explore" prompt="inspect files" />
      </>,
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls=');
    const ids = controlIds(html);
    expect(ids.length).toBe(3);
    expect(ids[0]).toContain("reasoning-panel");
    expect(ids[1]).toContain("tool-panel");
    expect(ids[2]).toContain("subtask-panel");
  });

  test("reasoning, tool and subtask controls expose expanded state with matching panel IDs", () => {
    const html = renderWithI18n(
      <>
        <ReasoningPart text="visible reasoning" defaultOpen={true} />
        <ToolPart tool="probe" output="visible output" defaultOpen={true} />
        <SubtaskPart agent="explore" prompt="visible prompt" defaultOpen={true} />
      </>,
    );

    const ids = controlIds(html);
    expect(ids.length).toBe(3);
    const reasoningPanelId = ids[0] ?? "";
    const toolPanelId = ids[1] ?? "";
    const subtaskPanelId = ids[2] ?? "";

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain(`id="${reasoningPanelId}"`);
    expect(html).toContain(`id="${toolPanelId}"`);
    expect(html).toContain(`id="${subtaskPanelId}"`);
  });
});
