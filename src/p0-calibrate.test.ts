import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCalibration, splitTemporalHoldout } from "./calibrate.ts";
import type { TimedTrainingRow } from "./calibrate.ts";

function withCache<T>(run: (cachePath: string, reportPath: string, sourcePath: string, dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-calibrate-"));
  const sourcePath = join(dir, "source.sqlite");
  try {
    seedSourceDb(sourcePath);
    mkdirSync(join(dir, "cache"));
    return run(join(dir, "cache", "cache.sqlite"), join(dir, "reports", "report.md"), sourcePath, dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedSourceDb(sourcePath: string): void {
  const db = new Database(sourcePath);
  db.run("CREATE TABLE source_marker (id TEXT PRIMARY KEY)");
  db.close();
}

function seedCalibrationCache(cachePath: string): void {
  const db = new Database(cachePath);
  db.exec(`
    CREATE TABLE session_metrics (
      session_id TEXT PRIMARY KEY,
      time_created INTEGER,
      summary_additions INTEGER,
      tool_error_rate REAL,
      compaction_count INTEGER,
      tokens_output INTEGER,
      tokens_reasoning INTEGER,
      patch_count INTEGER,
      is_subagent INTEGER,
      spawn_depth INTEGER
    );
  `);
  const insert = db.prepare("INSERT INTO session_metrics VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const base = Date.UTC(2026, 0, 1);
  for (let index = 0; index < 12; index++) {
    const label = index % 2;
    insert.run(
      `s${index}`,
      base + index * 86_400_000,
      label,
      label === 1 ? 0.02 : 0.8,
      label === 1 ? 0 : 8,
      100,
      label === 1 ? 50 : 1,
      label === 1 ? 8 : 0,
      0,
      0,
    );
  }
  db.close();
}

const REPORT_ALIAS_KINDS = ["exact", "symlink", "hardlink"] as const;
const REPORT_ALIAS_TARGETS = ["source", "cache"] as const;

function expectCalibrationInputsUnchanged(cachePath: string, sourcePath: string): void {
  const cache = new Database(cachePath, { readonly: true });
  try {
    const scoreConfig = cache.query<{ readonly name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'score_config'").get();
    expect(scoreConfig).toBeNull();
  } finally {
    cache.close();
  }
  const source = new Database(sourcePath, { readonly: true });
  try {
    const marker = source.query<{ readonly name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'source_marker'").get();
    expect(marker?.name).toBe("source_marker");
  } finally {
    source.close();
  }
}

describe("P0 calibration temporal holdout", () => {
  test("Given chronological rows When splitting Then training precedes holdout without overlap", () => {
    const rows: TimedTrainingRow[] = [0, 1, 2, 3, 4, 5].map((index) => ({
      time_created: index,
      label: index % 2 === 0 ? 0 : 1,
      features: { tool_error_rate: index, compaction_count: index, reasoning_ratio: index, patch_count: index, is_subagent: 0, spawn_depth: 0 },
    }));

    const split = splitTemporalHoldout(rows, 0.34);

    expect(split.train.map((row) => row.time_created)).toEqual([0, 1, 2, 3]);
    expect(split.holdout.map((row) => row.time_created)).toEqual([4, 5]);
    expect(Math.max(...split.train.map((row) => row.time_created))).toBeLessThan(Math.min(...split.holdout.map((row) => row.time_created)));
  });

  test("Given a synthetic cache When calibrating Then only validation metrics are authoritative", () => {
    withCache((cachePath, reportPath, sourcePath) => {
      seedCalibrationCache(cachePath);

      const result = runCalibration(cachePath, reportPath, sourcePath);
      const db = new Database(cachePath, { readonly: true });
      const configRows = db.query("SELECT key, value FROM score_config").all() as Array<{ readonly key: string; readonly value: number }>;
      db.close();
      const keys = new Set(configRows.map((row) => row.key));

      expect(result.trainRows).toBeGreaterThan(0);
      expect(result.holdoutRows).toBeGreaterThan(0);
      expect(keys.has("session_quality_score.validation_accuracy")).toBe(true);
      expect(keys.has("session_quality_score.validation_auc")).toBe(true);
      expect(keys.has("session_quality_score.accuracy")).toBe(false);
      expect(keys.has("session_quality_score.auc")).toBe(false);
      expect(readFileSync(reportPath, "utf8")).toContain("Temporal holdout");
    });
  });

  test("Given stale validation metrics When a new holdout has one label Then unavailable validation deletes stale keys", () => {
    withCache((cachePath, reportPath, sourcePath) => {
      seedCalibrationCache(cachePath);
      const first = runCalibration(cachePath, reportPath, sourcePath);
      const writer = new Database(cachePath);
      writer.run("UPDATE session_metrics SET summary_additions = 1 WHERE session_id IN ('s10', 's11')");
      writer.close();

      const second = runCalibration(cachePath, reportPath, sourcePath);
      const db = new Database(cachePath, { readonly: true });
      const configRows = db.query("SELECT key, value FROM score_config").all() as Array<{ readonly key: string; readonly value: number }>;
      db.close();
      const keys = new Set(configRows.map((row) => row.key));

      expect(first.validationAccuracy).not.toBeNull();
      expect(first.validationAuc).not.toBeNull();
      expect(second.validationAccuracy).toBeNull();
      expect(second.validationAuc).toBeNull();
      expect(keys.has("session_quality_score.validation_accuracy")).toBe(false);
      expect(keys.has("session_quality_score.validation_auc")).toBe(false);
    });
  });

  test("Given a new report parent When calibrating Then report permissions are private", () => {
    withCache((cachePath, reportPath, sourcePath, dir) => {
      seedCalibrationCache(cachePath);
      chmodSync(dir, 0o755);

      runCalibration(cachePath, reportPath, sourcePath);

      expect((statSync(join(dir, "reports")).mode & 0o777).toString(8)).toBe("700");
      expect((statSync(reportPath).mode & 0o777).toString(8)).toBe("600");
    });
  });

  test("Given caller-owned report parent When calibrating Then parent mode is preserved and report file is private", () => {
    withCache((cachePath, _reportPath, sourcePath, dir) => {
      seedCalibrationCache(cachePath);
      const reportParent = join(dir, "caller-reports");
      const reportPath = join(reportParent, "report.md");
      mkdirSync(reportParent);
      chmodSync(reportParent, 0o755);

      runCalibration(cachePath, reportPath, sourcePath);

      expect((statSync(reportParent).mode & 0o777).toString(8)).toBe("755");
      expect((statSync(reportPath).mode & 0o777).toString(8)).toBe("600");
    });
  });

  for (const targetName of REPORT_ALIAS_TARGETS) {
    for (const aliasKind of REPORT_ALIAS_KINDS) {
      test(`Given ${aliasKind} report path aliases ${targetName} database When calibrating Then it rejects before mutation`, () => {
        withCache((cachePath, _reportPath, sourcePath, dir) => {
          seedCalibrationCache(cachePath);
          const targetPath = targetName === "source" ? sourcePath : cachePath;
          const reportPath = aliasKind === "exact" ? targetPath : join(dir, `${targetName}-${aliasKind}-report.md`);
          if (aliasKind === "symlink") symlinkSync(targetPath, reportPath);
          if (aliasKind === "hardlink") linkSync(targetPath, reportPath);

          expect(() => runCalibration(cachePath, reportPath, sourcePath)).toThrow(/Report output path/);
          expectCalibrationInputsUnchanged(cachePath, sourcePath);
        });
      });
    }
  }

  test("Given caller-owned cache parent When calibrating Then parent mode is preserved and cache file is private", () => {
    withCache((cachePath, reportPath, sourcePath, dir) => {
      seedCalibrationCache(cachePath);
      chmodSync(join(dir, "cache"), 0o755);
      chmodSync(cachePath, 0o644);

      runCalibration(cachePath, reportPath, sourcePath);

      expect((statSync(join(dir, "cache")).mode & 0o777).toString(8)).toBe("755");
      expect((statSync(cachePath).mode & 0o777).toString(8)).toBe("600");
    });
  });

  test("Given source and cache paths alias When calibrating Then calibration fails closed", () => {
    withCache((cachePath, reportPath) => {
      seedCalibrationCache(cachePath);

      expect(() => runCalibration(cachePath, reportPath, cachePath)).toThrow(/distinct/);
    });
  });
});
