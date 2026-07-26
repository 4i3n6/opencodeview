import { Database } from "bun:sqlite";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { applyPrivateCacheArtifactModes, preparePrivateCachePath, preparePrivateOutputPath } from "./db-paths.ts";

export const PREDICTOR_KEYS = [
  "tool_error_rate",
  "compaction_count",
  "reasoning_ratio",
  "patch_count",
  "is_subagent",
  "spawn_depth",
] as const;

export type PredictorKey = (typeof PREDICTOR_KEYS)[number];
export type FeatureVector = { readonly [Key in PredictorKey]: number };
export type TrainingRow = { readonly label: 0 | 1; readonly features: FeatureVector };
export type TimedTrainingRow = TrainingRow & { readonly time_created: number };
export type NormalizedRow = TrainingRow & { readonly normalized: FeatureVector };
export type NormalizationStats = { readonly [Key in PredictorKey]: { readonly mean: number; readonly std: number } };
export type LogisticModel = { readonly bias: number; readonly weights: FeatureVector; readonly stats: NormalizationStats };
export type TrainingOptions = { readonly iterations: number; readonly learningRate: number; readonly l2: number };

const TRAINING_CUTOFF_MS = Date.UTC(2026, 5, 1);
const CACHE_DB = process.env.OPENCODEVIEW_CACHE ?? join(import.meta.dir, "..", ".cache", "analytics.sqlite");
const SRC_DB = process.env.OPENCODE_DB ?? join(homedir(), ".local", "share", "opencode", "opencode.db");
const REPORT_PATH = join(import.meta.dir, "..", ".cache", "calibration-report.md");
const EPSILON = 1e-12;

type MutableFeatureVector = Record<PredictorKey, number>;
type RawTrainingRow = FeatureVector & { readonly label: number };
type ScoreConfigEntry = { readonly key: string; readonly value: number };

class CalibrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationError";
  }
}

function emptyFeatures(): MutableFeatureVector {
  return { tool_error_rate: 0, compaction_count: 0, reasoning_ratio: 0, patch_count: 0, is_subagent: 0, spawn_depth: 0 };
}

function emptyStats(): Record<PredictorKey, { mean: number; std: number }> {
  return {
    tool_error_rate: { mean: 0, std: 1 },
    compaction_count: { mean: 0, std: 1 },
    reasoning_ratio: { mean: 0, std: 1 },
    patch_count: { mean: 0, std: 1 },
    is_subagent: { mean: 0, std: 1 },
    spawn_depth: { mean: 0, std: 1 },
  };
}

function sigmoid(value: number): number {
  if (value >= 35) return 1;
  if (value <= -35) return 0;
  return 1 / (1 + Math.exp(-value));
}

function scoreRow(model: LogisticModel, row: NormalizedRow): number {
  let linear = model.bias;
  for (const key of PREDICTOR_KEYS) linear += model.weights[key] * row.normalized[key];
  return sigmoid(linear);
}

function toTrainingRow(row: RawTrainingRow): TrainingRow {
  const label = row.label > 0 ? 1 : 0;
  return {
    label,
    features: {
      tool_error_rate: row.tool_error_rate,
      compaction_count: row.compaction_count,
      reasoning_ratio: row.reasoning_ratio,
      patch_count: row.patch_count,
      is_subagent: row.is_subagent,
      spawn_depth: row.spawn_depth,
    },
  };
}

function toTimedTrainingRow(row: RawTrainingRow & { readonly time_created: number }): TimedTrainingRow {
  return { ...toTrainingRow(row), time_created: row.time_created };
}

export function normalizeTrainingRows(rows: readonly TrainingRow[]): { readonly rows: readonly NormalizedRow[]; readonly stats: NormalizationStats } {
  if (rows.length === 0) throw new CalibrationError("No eligible sessions for calibration.");
  const means = emptyFeatures();
  const variances = emptyFeatures();
  const stats = emptyStats();
  for (const row of rows) for (const key of PREDICTOR_KEYS) means[key] += row.features[key] / rows.length;
  for (const row of rows) for (const key of PREDICTOR_KEYS) variances[key] += (row.features[key] - means[key]) ** 2 / rows.length;
  for (const key of PREDICTOR_KEYS) stats[key] = { mean: means[key], std: Math.sqrt(variances[key]) > EPSILON ? Math.sqrt(variances[key]) : 1 };
  return {
    stats,
    rows: rows.map((row) => {
      const normalized = emptyFeatures();
      for (const key of PREDICTOR_KEYS) normalized[key] = (row.features[key] - stats[key].mean) / stats[key].std;
      return { ...row, normalized };
    }),
  };
}

export function splitTemporalHoldout(rows: readonly TimedTrainingRow[], holdoutRatio = 0.2): { readonly train: readonly TimedTrainingRow[]; readonly holdout: readonly TimedTrainingRow[] } {
  const ordered = [...rows].sort((left, right) => left.time_created - right.time_created);
  const holdoutSize = Math.max(1, Math.round(ordered.length * holdoutRatio));
  const splitAt = Math.max(1, ordered.length - holdoutSize);
  return { train: ordered.slice(0, splitAt), holdout: ordered.slice(splitAt) };
}

function normalizeWithStats(rows: readonly TimedTrainingRow[], stats: NormalizationStats): readonly NormalizedRow[] {
  return rows.map((row) => {
    const normalized = emptyFeatures();
    for (const key of PREDICTOR_KEYS) normalized[key] = (row.features[key] - stats[key].mean) / stats[key].std;
    return { label: row.label, features: row.features, normalized };
  });
}

export function trainLogisticRegression(dataset: { readonly rows: readonly NormalizedRow[]; readonly stats: NormalizationStats }, options: TrainingOptions): LogisticModel {
  const weights = emptyFeatures();
  let bias = 0;
  for (let step = 0; step < options.iterations; step++) {
    const gradient = emptyFeatures();
    let biasGradient = 0;
    for (const row of dataset.rows) {
      const error = scoreRow({ bias, weights, stats: dataset.stats }, row) - row.label;
      biasGradient += error / dataset.rows.length;
      for (const key of PREDICTOR_KEYS) gradient[key] += (error * row.normalized[key]) / dataset.rows.length;
    }
    bias -= options.learningRate * biasGradient;
    for (const key of PREDICTOR_KEYS) weights[key] -= options.learningRate * (gradient[key] + options.l2 * weights[key]);
  }
  return { bias, weights, stats: dataset.stats };
}

export function calculateAuc(values: readonly { readonly label: 0 | 1; readonly score: number }[]): number {
  const positives = values.filter((row) => row.label === 1).length;
  const negatives = values.length - positives;
  if (positives === 0 || negatives === 0) return Number.NaN;
  const ordered = [...values].sort((left, right) => left.score - right.score);
  let positiveRanks = 0;
  for (let index = 0; index < ordered.length; ) {
    let end = index + 1;
    while (end < ordered.length && ordered[end].score === ordered[index].score) end++;
    const rank = (index + 1 + end) / 2;
    for (let cursor = index; cursor < end; cursor++) if (ordered[cursor].label === 1) positiveRanks += rank;
    index = end;
  }
  return (positiveRanks - (positives * (positives + 1)) / 2) / (positives * negatives);
}

export function evaluateLogisticModel(model: LogisticModel, dataset: { readonly rows: readonly NormalizedRow[] }): { readonly accuracy: number; readonly auc: number } {
  const scored = dataset.rows.map((row) => ({ label: row.label, score: scoreRow(model, row) }));
  const correct = scored.filter((row) => (row.score >= 0.5 ? 1 : 0) === row.label).length;
  return { accuracy: correct / scored.length, auc: calculateAuc(scored) };
}

function openCache(path: string): Database {
  if (!existsSync(path)) throw new CalibrationError(`Cache not found: ${path}`);
  return new Database(path);
}

function loadTrainingRows(db: Database): readonly TimedTrainingRow[] {
  const rows = db
    .query<RawTrainingRow & { readonly time_created: number }, [number]>(`
      SELECT
        time_created,
        CASE WHEN COALESCE(summary_additions, 0) > 0 THEN 1 ELSE 0 END AS label,
        COALESCE(tool_error_rate, 0) AS tool_error_rate,
        COALESCE(compaction_count, 0) AS compaction_count,
        CASE WHEN COALESCE(tokens_output, 0) > 0 THEN COALESCE(tokens_reasoning, 0) * 1.0 / tokens_output ELSE 0 END AS reasoning_ratio,
        COALESCE(patch_count, 0) AS patch_count,
        COALESCE(is_subagent, 0) AS is_subagent,
        COALESCE(spawn_depth, 0) AS spawn_depth
      FROM session_metrics
      WHERE time_created < ?
    `)
    .all(TRAINING_CUTOFF_MS);
  return rows.map(toTimedTrainingRow);
}

function ensureScoreConfig(db: Database): void {
  db.run("CREATE TABLE IF NOT EXISTS score_config (key TEXT PRIMARY KEY, value REAL)");
}

function saveScoreConfig(db: Database, model: LogisticModel, evaluation: { readonly validationAccuracy: number | null; readonly validationAuc: number | null; readonly trainRows: number; readonly holdoutRows: number }): void {
  ensureScoreConfig(db);
  const entries: ScoreConfigEntry[] = [
    { key: "session_quality_score.bias", value: model.bias },
    { key: "session_quality_score.training_rows", value: evaluation.trainRows },
    { key: "session_quality_score.holdout_rows", value: evaluation.holdoutRows },
  ];
  if (evaluation.validationAccuracy !== null) entries.push({ key: "session_quality_score.validation_accuracy", value: evaluation.validationAccuracy });
  if (evaluation.validationAuc !== null) entries.push({ key: "session_quality_score.validation_auc", value: evaluation.validationAuc });
  for (const key of PREDICTOR_KEYS) {
    entries.push({ key: `session_quality_score.weight.${key}`, value: model.weights[key] });
    entries.push({ key: `session_quality_score.mean.${key}`, value: model.stats[key].mean });
    entries.push({ key: `session_quality_score.std.${key}`, value: model.stats[key].std });
  }
  const upsert = db.prepare<ScoreConfigEntry, [string, number]>("INSERT INTO score_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const removeStale = db.prepare("DELETE FROM score_config WHERE key IN ('session_quality_score.accuracy', 'session_quality_score.auc', 'session_quality_score.validation_accuracy', 'session_quality_score.validation_auc')");
  db.transaction((items: readonly ScoreConfigEntry[]) => {
    removeStale.run();
    for (const item of items) upsert.run(item.key, item.value);
  })(entries);
}

function predictorReport(model: LogisticModel): string {
  const expected: Record<PredictorKey, number> = { tool_error_rate: -1, compaction_count: -1, reasoning_ratio: 1, patch_count: 1, is_subagent: -1, spawn_depth: -1 };
  return [...PREDICTOR_KEYS]
    .sort((left, right) => Math.abs(model.weights[right]) - Math.abs(model.weights[left]))
    .map((key) => {
      const weight = model.weights[key];
      const status = Math.abs(weight) < 0.05 ? "weak signal" : Math.sign(weight) === expected[key] ? "aligned" : "contrary";
      return `| ${key} | ${weight.toFixed(6)} | ${model.stats[key].mean.toFixed(6)} | ${model.stats[key].std.toFixed(6)} | ${status} |`;
    })
    .join("\n");
}

function buildReport(model: LogisticModel, evaluation: { readonly validationAccuracy: number | null; readonly validationAuc: number | null; readonly trainRows: number; readonly holdoutRows: number }): string {
  const validationAccuracy = evaluation.validationAccuracy === null ? "unavailable" : `${(evaluation.validationAccuracy * 100).toFixed(2)}%`;
  const validationAuc = evaluation.validationAuc === null ? "unavailable" : evaluation.validationAuc.toFixed(4);
  return `# session_quality_score calibration report

Eligible rows are restricted to sessions with \`time_created\` before 2026-06-01. The rows are sorted chronologically; earlier rows train the model and later rows form the temporal holdout. Label: \`summary_additions > 0\`.

- Training rows: ${evaluation.trainRows}
- Temporal holdout rows: ${evaluation.holdoutRows}
- Validation accuracy: ${validationAccuracy}
- Validation AUC: ${validationAuc}
- Intercept: ${model.bias.toFixed(6)}

## Weights and normalization

| predictor | weight | training mean | training std | reading |
|---|---:|---:|---:|---|
${predictorReport(model)}

## Limitations

Validation metrics are persisted only when the temporal holdout contains both labels. Normalization means and standard deviations come only from training rows and are applied unchanged to holdout rows.
`;
}

export function runCalibration(cachePath = CACHE_DB, reportPath = REPORT_PATH, sourcePath = SRC_DB): { readonly validationAccuracy: number | null; readonly validationAuc: number | null; readonly trainRows: number; readonly holdoutRows: number; readonly rows: number } {
  const preparedReport = preparePrivateOutputPath({ outputPath: reportPath, forbiddenPaths: [sourcePath, cachePath], outputKind: "Report" });
  const prepared = preparePrivateCachePath({ sourcePath, cachePath });
  const db = openCache(prepared.cachePath);
  try {
    const rows = loadTrainingRows(db);
    const split = splitTemporalHoldout(rows);
    const dataset = normalizeTrainingRows(split.train);
    const model = trainLogisticRegression(dataset, { iterations: 1_200, learningRate: 0.08, l2: 0.001 });
    const holdout = normalizeWithStats(split.holdout, dataset.stats);
    const labels = new Set(holdout.map((row) => row.label));
    const validation = labels.has(0) && labels.has(1) ? evaluateLogisticModel(model, { rows: holdout }) : null;
    const evaluation = {
      validationAccuracy: validation?.accuracy ?? null,
      validationAuc: validation && Number.isFinite(validation.auc) ? validation.auc : null,
      trainRows: split.train.length,
      holdoutRows: split.holdout.length,
    };
    saveScoreConfig(db, model, evaluation);
    applyPrivateCacheArtifactModes(prepared.cachePath);
    writeFileSync(preparedReport.outputPath, buildReport(model, evaluation), { mode: 0o600 });
    chmodSync(preparedReport.outputPath, 0o600);
    return { ...evaluation, rows: rows.length };
  } finally {
    db.close();
  }
}

if (import.meta.main) {
  try {
    const result = runCalibration();
    console.log(`calibration rows=${result.rows} train=${result.trainRows} holdout=${result.holdoutRows} validation_accuracy=${result.validationAccuracy ?? "unavailable"} validation_auc=${result.validationAuc ?? "unavailable"}`);
    console.log(`report=${REPORT_PATH}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
