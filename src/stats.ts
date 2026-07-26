/**
 * Pure statistical helpers for OpencodeView analytics.
 *
 * No external dependencies beyond bun:test (in the sibling test file). Every
 * function here is deterministic and side-effect free so it can be reused by
 * scan.ts, calibrate.ts (offline calibration) and the API layer without
 * surprises. Nothing in this module touches SQLite or the filesystem.
 */

// ---------- percentile / median / MAD ----------

/**
 * Linear-interpolation percentile (matches numpy's default "linear" method
 * and R's type-7 quantile). `sortedAsc` MUST already be sorted ascending —
 * this function does not sort, so callers control the (possibly expensive)
 * sort step once and reuse it across multiple percentile() calls.
 *
 * `q` is clamped to [0,1]. Returns NaN for an empty input.
 */
export function percentile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const clamped = q < 0 ? 0 : q > 1 ? 1 : q;
  const idx = clamped * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const frac = idx - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

/** Median of an arbitrary (unsorted) array. Sorts a copy internally, so the
 * input array is never mutated. Returns NaN for an empty input. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return percentile(sorted, 0.5);
}

/**
 * Median Absolute Deviation, unscaled: median(|x_i - median(x)|).
 * Pair with `robustZ` for a normal-consistent robust z-score — that's where
 * the 1.4826 consistency constant is applied, not here, so `mad()` stays a
 * plain, reusable descriptive statistic.
 */
export function mad(values: number[]): number {
  if (values.length === 0) return NaN;
  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

// ---------- Wilson score interval ----------

export interface WilsonInterval {
  lo: number;
  hi: number;
  point: number;
}

/**
 * Wilson score confidence interval for a binomial proportion (succ out of
 * n trials). Preferred over the naive normal approximation because it stays
 * well-behaved for small n and rates near 0 or 1 — exactly the regime of
 * per-session tool error rates and apply_patch precision, which are often
 * computed from a handful of calls.
 *
 * `z` defaults to 1.96 (~95% confidence). For n <= 0 (no trials, no signal)
 * returns the maximally uncertain interval [0,1] with point estimate 0.
 */
export function wilson(succ: number, n: number, z = 1.96): WilsonInterval {
  if (n <= 0) return { lo: 0, hi: 1, point: 0 };
  const phat = succ / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((phat * (1 - phat)) / n + z2 / (4 * n * n))) / denom;
  return {
    lo: Math.max(0, center - margin),
    hi: Math.min(1, center + margin),
    point: phat,
  };
}

// ---------- Empirical-Bayes shrinkage ----------

/**
 * Shrinks an observed rate toward a prior mean, weighted by `priorStrength`
 * (in "pseudo-observation" units): shrunk = (rate*n + priorMean*priorStrength)
 * / (n + priorStrength).
 *
 * Small-n sessions (e.g. 2 tool calls, 1 error) get pulled toward the
 * corpus-wide prior instead of reporting a noisy 0%/50%/100% rate. As n grows
 * the shrunk estimate converges to the raw observed rate.
 */
export function ebShrink(rate: number, n: number, priorMean: number, priorStrength: number): number {
  const denom = n + priorStrength;
  if (denom <= 0) return priorMean;
  return (rate * n + priorMean * priorStrength) / denom;
}

// ---------- robust z-score ----------

/**
 * Robust z-score using median/MAD instead of mean/stddev, resistant to the
 * heavy-tailed outliers common in token/duration/latency data.
 *
 * `madValue` is the raw (unscaled) MAD as returned by `mad()`; this function
 * applies the 1.4826 constant so the scale is consistent with a Gaussian
 * standard deviation under normality.
 *
 * When the scaled MAD is 0 (e.g. a constant series), falls back to a signed
 * infinity so outliers are still distinguishable from the (degenerate) center
 * without dividing by zero into NaN.
 */
export function robustZ(x: number, med: number, madValue: number): number {
  const scaled = madValue * 1.4826;
  if (scaled === 0) {
    if (x === med) return 0;
    return x > med ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  return (x - med) / scaled;
}

// ---------- EWMA ----------

/**
 * Exponentially weighted moving average. `alpha` in (0,1]; higher alpha
 * weighs recent points more heavily. Returns an array the same length as
 * `series` (out[0] === series[0]).
 */
export function ewma(series: number[], alpha: number): number[] {
  if (series.length === 0) return [];
  const out = Array.from({ length: series.length }, () => 0);
  out[0] = series[0];
  for (let i = 1; i < series.length; i++) {
    out[i] = alpha * series[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

// ---------- changepoint detection ----------

const CHANGEPOINT_MIN_SEGMENT = 2;
const CHANGEPOINT_DEFAULT_THRESHOLD = 3;

/**
 * Detects level-shift (mean-shift) changepoints in a numeric series via
 * binary segmentation over a pooled-variance-normalized CUSUM statistic —
 * the same family of test used by standard "at most one change" / binary
 * segmentation changepoint methods. Deterministic, dependency-free.
 *
 * For each candidate split k in a segment [lo,hi), the score is
 * `sqrt(nLeft*nRight/len) * |meanLeft-meanRight| / pooledStd`, where
 * `pooledStd` is derived from the WITHIN-segment residual variance (not the
 * raw series spread) so a clean step function (zero within-segment noise)
 * scores as a decisive split instead of being masked by its own jump size —
 * a common pitfall of normalizing against the whole series' spread.
 *
 * Returns the sorted list of indices where a new regime starts (e.g. `[4]`
 * for a 6-point series means series[0..3] is one regime and series[4..] is
 * another; index 0 itself is never returned since it is the start of the
 * first regime by definition).
 *
 * `threshold` (default 3, analogous to a ~3-sigma mean shift) is the minimum
 * score required to accept a split; higher = fewer, more conservative
 * changepoints. O(n^2) worst case per recursion level — fine for the short
 * monthly series this is designed for (data-quality coverage per field, at
 * most a couple hundred points).
 */
export function changepoint(series: number[], threshold = CHANGEPOINT_DEFAULT_THRESHOLD): number[] {
  const n = series.length;
  if (n < 2 * CHANGEPOINT_MIN_SEGMENT) return [];

  // Prefix sums of x and x^2 give O(1) segment mean/sum-of-squares lookups.
  const prefixSum = Array.from({ length: n + 1 }, () => 0);
  const prefixSumSq = Array.from({ length: n + 1 }, () => 0);
  for (let i = 0; i < n; i++) {
    prefixSum[i + 1] = prefixSum[i] + series[i];
    prefixSumSq[i + 1] = prefixSumSq[i] + series[i] * series[i];
  }
  function segStats(lo: number, hi: number): { mean: number; ss: number } {
    const len = hi - lo;
    const sum = prefixSum[hi] - prefixSum[lo];
    const sumSq = prefixSumSq[hi] - prefixSumSq[lo];
    const mean = sum / len;
    // Sum of squared deviations from the segment mean, clamped to >= 0 to
    // absorb floating-point rounding around exact-zero variance.
    const ss = Math.max(0, sumSq - len * mean * mean);
    return { mean, ss };
  }

  const points = new Set<number>();
  function scan(lo: number, hi: number): void {
    const len = hi - lo;
    if (len < 2 * CHANGEPOINT_MIN_SEGMENT) return;
    let bestK = -1;
    let bestScore = 0;
    for (let k = lo + CHANGEPOINT_MIN_SEGMENT; k <= hi - CHANGEPOINT_MIN_SEGMENT; k++) {
      const left = segStats(lo, k);
      const right = segStats(k, hi);
      const diff = Math.abs(left.mean - right.mean);
      const weight = Math.sqrt(((k - lo) * (hi - k)) / len);
      const pooledVar = (left.ss + right.ss) / Math.max(1, len - 2);
      const s = Math.sqrt(pooledVar);
      // s === 0 means both sides fit their own mean perfectly (e.g. a clean
      // step function): any nonzero diff is decisive evidence of a split.
      const score = s > 0 ? (weight * diff) / s : diff > 0 ? Number.POSITIVE_INFINITY : 0;
      if (score > bestScore) {
        bestScore = score;
        bestK = k;
      }
    }
    if (bestK === -1 || bestScore <= threshold) return;
    points.add(bestK);
    scan(lo, bestK);
    scan(bestK, hi);
  }

  scan(0, n);
  return [...points].sort((a, b) => a - b);
}
