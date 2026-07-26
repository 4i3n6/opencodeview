import { describe, expect, test } from "bun:test";
import {
  PREDICTOR_KEYS,
  calculateAuc,
  evaluateLogisticModel,
  normalizeTrainingRows,
  trainLogisticRegression,
} from "./calibrate";
import type { TrainingRow } from "./calibrate";

describe("calibration math", () => {
  test("Given separable delivery rows When training logistic regression Then it ranks delivered sessions above failures", () => {
    // Given
    const rows: TrainingRow[] = [
      { label: 0, features: { tool_error_rate: 0.6, compaction_count: 9, reasoning_ratio: 0.05, patch_count: 0, is_subagent: 0, spawn_depth: 0 } },
      { label: 0, features: { tool_error_rate: 0.5, compaction_count: 7, reasoning_ratio: 0.02, patch_count: 1, is_subagent: 1, spawn_depth: 2 } },
      { label: 1, features: { tool_error_rate: 0.02, compaction_count: 0, reasoning_ratio: 0.4, patch_count: 7, is_subagent: 0, spawn_depth: 0 } },
      { label: 1, features: { tool_error_rate: 0.03, compaction_count: 1, reasoning_ratio: 0.3, patch_count: 5, is_subagent: 1, spawn_depth: 1 } },
    ];

    // When
    const dataset = normalizeTrainingRows(rows);
    const model = trainLogisticRegression(dataset, { iterations: 800, learningRate: 0.25, l2: 0.001 });
    const evaluation = evaluateLogisticModel(model, dataset);

    // Then
    expect(PREDICTOR_KEYS).toContain("tool_error_rate");
    expect(evaluation.accuracy).toBe(1);
    expect(evaluation.auc).toBe(1);
    expect(model.weights.patch_count).toBeGreaterThan(0);
    expect(model.weights.tool_error_rate).toBeLessThan(0);
  });

  test("Given a constant predictor When normalizing rows Then the z-score is finite and std fallback is one", () => {
    // Given
    const rows: TrainingRow[] = [
      { label: 0, features: { tool_error_rate: 0.1, compaction_count: 2, reasoning_ratio: 0, patch_count: 0, is_subagent: 0, spawn_depth: 0 } },
      { label: 1, features: { tool_error_rate: 0.1, compaction_count: 2, reasoning_ratio: 0, patch_count: 4, is_subagent: 0, spawn_depth: 0 } },
    ];

    // When
    const dataset = normalizeTrainingRows(rows);

    // Then
    expect(dataset.stats.tool_error_rate.std).toBe(1);
    expect(dataset.rows.every((row) => Number.isFinite(row.normalized.tool_error_rate))).toBe(true);
  });

  test("Given tied scores When calculating AUC Then tied positive and negative pairs count as half", () => {
    // Given
    const ranked: { readonly label: 0 | 1; readonly score: number }[] = [
      { label: 0, score: 0.2 },
      { label: 1, score: 0.2 },
      { label: 1, score: 0.9 },
      { label: 0, score: 0.1 },
    ];

    // When
    const auc = calculateAuc(ranked);

    // Then
    expect(auc).toBe(0.875);
  });
});
