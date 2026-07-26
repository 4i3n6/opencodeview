import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";
import { translate, type MessageKey, type MessageValues } from "../../i18n/catalogs";
import * as realUtils from "../../lib/utils";
import { formatDurationSeconds } from "../../i18n/format";

mock.module("@/i18n/context", () => ({
  useI18n: () => ({
    locale: "en-US",
    setLocale: () => {},
    t: (key: MessageKey, values?: MessageValues) => translate("en-US", key, values),
  }),
}));

mock.module("@/lib/utils", () => ({
  ...realUtils,
}));

mock.module("@/i18n/format", () => ({
  formatDurationSeconds,
}));

const { formatActiveMinuteAxis } = await import("./depthChartFormat");

describe("DepthChart active-time axis formatter", () => {
  test("keeps representative sub-hour ticks readable and distinct", () => {
    const labels = [0.5, 3, 6, 9, 12].map((minutes) => formatActiveMinuteAxis(minutes, "en-US"));

    expect(labels).toEqual(["30s", "3min", "6min", "9min", "12min"]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  test("formats sub-hour Portuguese ticks without collapsing adjacent minute values", () => {
    const labels = [3, 6].map((minutes) => formatActiveMinuteAxis(minutes, "pt-BR"));

    expect(labels).toEqual(["3 min", "6 min"]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
