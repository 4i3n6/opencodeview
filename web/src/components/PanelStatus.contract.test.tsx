import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { translate, type MessageKey, type MessageValues } from "../i18n/catalogs";

mock.module("@/i18n/context", () => ({
  useI18n: () => ({
    locale: "en-US",
    setLocale: () => undefined,
    t: (key: MessageKey, values?: MessageValues) => translate("en-US", key, values),
  }),
}));

mock.module("@/lib/utils", () => ({
  cn: (...classes: readonly (string | false | null | undefined)[]) => classes.filter(Boolean).join(" "),
  fmtDecimal: (value: number | null | undefined) => String(value ?? "-"),
  fmtDurationS: (value: number | null | undefined) => String(value ?? "-"),
  fmtHours: (value: number | null | undefined) => String(value ?? "-"),
  fmtInt: (value: number | null | undefined) => String(value ?? "-"),
  fmtM: (value: number | null | undefined) => String(value ?? "-"),
  fmtPct: (value: number | null | undefined) => String(value ?? "-"),
  wilsonInterval: () => ({ lo: 0, hi: 1 }),
}));

const { PanelStatus } = await import("./PanelStatus");

describe("PanelStatus contract", () => {
  test("renders loading and empty states as polite status updates", () => {
    const loading = renderToStaticMarkup(<PanelStatus />);
    const empty = renderToStaticMarkup(<PanelStatus kind="empty" />);

    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-live="polite"');
    expect(loading).toContain(translate("en-US", "common.loading"));
    expect(empty).toContain('role="status"');
    expect(empty).toContain(translate("en-US", "common.emptyScope"));
  });

  test("renders error state as an assertive alert with the bad tone", () => {
    const html = renderToStaticMarkup(<PanelStatus kind="error" />);

    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain("text-[var(--color-bad)]");
    expect(html).toContain(translate("en-US", "common.loadError"));
  });
});
