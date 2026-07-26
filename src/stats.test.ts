import { describe, expect, test } from "bun:test";
import { changepoint, ebShrink, ewma, mad, median, percentile, robustZ, wilson } from "./stats.ts";

describe("percentile", () => {
  test("returns NaN for an empty array", () => {
    expect(percentile([], 0.5)).toBeNaN();
  });

  test("returns the single element regardless of q", () => {
    expect(percentile([42], 0)).toBe(42);
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 1)).toBe(42);
  });

  test("q=0 and q=1 return the extremes", () => {
    const xs = [1, 2, 3, 4, 5];
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 1)).toBe(5);
  });

  test("interpolates linearly between the two nearest ranks", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
    expect(percentile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6, 10);
  });

  test("clamps out-of-range q to [0,1]", () => {
    const xs = [1, 2, 3];
    expect(percentile(xs, -1)).toBe(1);
    expect(percentile(xs, 2)).toBe(3);
  });
});

describe("median", () => {
  test("returns NaN for an empty array", () => {
    expect(median([])).toBeNaN();
  });

  test("does not mutate the input array", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  test("odd-length array", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  test("even-length array averages the two middle values", () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5, 10);
  });
});

describe("mad", () => {
  test("returns NaN for an empty array", () => {
    expect(mad([])).toBeNaN();
  });

  test("known example: median absolute deviation of 1..5 is 1", () => {
    expect(mad([1, 2, 3, 4, 5])).toBe(1);
  });

  test("is 0 for a constant series", () => {
    expect(mad([7, 7, 7, 7])).toBe(0);
  });
});

describe("wilson", () => {
  test("n<=0 returns the maximally uncertain interval", () => {
    expect(wilson(0, 0)).toEqual({ lo: 0, hi: 1, point: 0 });
  });

  test("matches the textbook 8/10 example (~0.49, ~0.94)", () => {
    const { lo, hi, point } = wilson(8, 10);
    expect(point).toBeCloseTo(0.8, 10);
    expect(lo).toBeCloseTo(0.4902, 4);
    expect(hi).toBeCloseTo(0.9433, 4);
  });

  test("100% success still yields hi clamped to 1 and a lo < 1", () => {
    const { lo, hi, point } = wilson(10, 10);
    expect(point).toBe(1);
    expect(hi).toBe(1);
    expect(lo).toBeLessThan(1);
    expect(lo).toBeGreaterThan(0.6);
  });

  test("0% success yields lo clamped to 0 and a hi > 0", () => {
    const { lo, hi } = wilson(0, 10);
    expect(lo).toBe(0);
    expect(hi).toBeGreaterThan(0);
  });

  test("lo <= point <= hi holds across a range of inputs", () => {
    for (const [succ, n] of [[1, 3], [5, 20], [50, 100], [99, 100], [1, 1000]] as const) {
      const { lo, hi, point } = wilson(succ, n);
      expect(lo).toBeLessThanOrEqual(point);
      expect(point).toBeLessThanOrEqual(hi);
    }
  });

  test("more trials at the same observed rate narrows the interval", () => {
    const narrow = wilson(50, 100);
    const wide = wilson(5, 10);
    expect(narrow.point).toBeCloseTo(wide.point, 10);
    expect(narrow.hi - narrow.lo).toBeLessThan(wide.hi - wide.lo);
  });

  test("a lower z narrows the interval", () => {
    const z95 = wilson(5, 20, 1.96);
    const z90 = wilson(5, 20, 1.645);
    expect(z90.hi - z90.lo).toBeLessThan(z95.hi - z95.lo);
  });
});

describe("ebShrink", () => {
  test("n=0 returns the prior mean untouched", () => {
    expect(ebShrink(0.9, 0, 0.3, 20)).toBe(0.3);
  });

  test("small n pulls the observed rate toward the prior", () => {
    const shrunk = ebShrink(0.1, 5, 0.3, 20);
    expect(shrunk).toBeCloseTo(0.26, 10);
    // closer to the prior (0.3) than the raw observed rate (0.1) given n << priorStrength
    expect(Math.abs(shrunk - 0.3)).toBeLessThan(Math.abs(shrunk - 0.1));
  });

  test("large n makes the shrunk rate converge to the observed rate", () => {
    const shrunk = ebShrink(0.1, 1000, 0.3, 20);
    expect(shrunk).toBeCloseTo(0.1, 2);
  });

  test("priorStrength=0 with n>0 returns the raw observed rate", () => {
    expect(ebShrink(0.42, 10, 0.9, 0)).toBeCloseTo(0.42, 10);
  });
});

describe("robustZ", () => {
  test("matches (x-med)/(mad*1.4826) in the regular case", () => {
    expect(robustZ(16, 10, 2)).toBeCloseTo((16 - 10) / (2 * 1.4826), 10);
  });

  test("is 0 when x equals the median, even with mad=0", () => {
    expect(robustZ(5, 5, 0)).toBe(0);
  });

  test("degenerates to signed infinity when mad=0 and x differs from the median", () => {
    expect(robustZ(10, 5, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(robustZ(1, 5, 0)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe("ewma", () => {
  test("returns an empty array for empty input", () => {
    expect(ewma([], 0.5)).toEqual([]);
  });

  test("first point always equals the first raw value", () => {
    expect(ewma([10, 20, 30], 0.3)[0]).toBe(10);
  });

  test("alpha=1 tracks the raw series exactly", () => {
    const xs = [1, 5, 2, 9];
    expect(ewma(xs, 1)).toEqual(xs);
  });

  test("known recurrence for alpha=0.5", () => {
    const out = ewma([1, 2, 3, 4, 5], 0.5);
    expect(out[0]).toBeCloseTo(1, 10);
    expect(out[1]).toBeCloseTo(1.5, 10);
    expect(out[2]).toBeCloseTo(2.25, 10);
    expect(out[3]).toBeCloseTo(3.125, 10);
    expect(out[4]).toBeCloseTo(4.0625, 10);
  });
});

describe("changepoint", () => {
  test("returns [] below the minimum series length", () => {
    expect(changepoint([])).toEqual([]);
    expect(changepoint([1, 9])).toEqual([]);
    expect(changepoint([1, 2, 3])).toEqual([]);
  });

  test("returns [] for a constant series", () => {
    expect(changepoint([5, 5, 5, 5, 5, 5])).toEqual([]);
  });

  test("returns [] for noisy-but-stationary data", () => {
    expect(changepoint([5, 5.1, 4.9, 5.05, 4.95, 5, 5.1, 4.9])).toEqual([]);
  });

  test("detects a single clean step at the right index", () => {
    expect(changepoint([1, 1, 1, 1, 10, 10, 10, 10])).toEqual([4]);
  });

  test("detects a step even in the shortest possible series (len=4)", () => {
    expect(changepoint([1, 1, 9, 9])).toEqual([2]);
  });

  test("detects two shifts in a three-regime series", () => {
    expect(changepoint([1, 1, 1, 1, 5, 5, 5, 5, 9, 9, 9, 9])).toEqual([4, 8]);
  });

  test("a lower threshold accepts weaker (noisy) shifts", () => {
    const weakShiftWithNoise = [1, 1.1, 0.9, 1.05, 1.5, 1.6, 1.4, 1.55];
    expect(changepoint(weakShiftWithNoise, 100)).toEqual([]);
    expect(changepoint(weakShiftWithNoise, 1)).toEqual([4]);
  });

  // Real motivating case (blueprint §1): summary_additions coverage collapses
  // from ~30-40% down to ~0% starting 2026-06, which is exactly the kind of
  // data-quality regime break this function feeds into computeDataQuality().
  test("flags the 2026-06 data-quality collapse in a monthly coverage series", () => {
    const monthlyCoverage = [0.429, 0.319, 0.296, 0.327, 0.004, 0.0];
    expect(changepoint(monthlyCoverage)).toEqual([4]);
  });
});
