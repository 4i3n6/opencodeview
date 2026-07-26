#!/usr/bin/env bun
/**
 * OpencodeView — project-first analytical scanner (read-only).
 *
 * Reads ~/.local/share/opencode/opencode.db in READ-ONLY mode, scopes every
 * heavy query by project_id (using session_project_idx + part_session_idx),
 * materializes per-session metrics into a SEPARATE cache database, and never
 * writes to the source DB.
 *
 * Usage:
 *   bun src/scan.ts --list                 # list projects (cheap aggregates)
 *   bun src/scan.ts <slug|project_id>      # scan one project into the cache
 *   bun src/scan.ts <slug> --gap-min 30    # custom work-burst gap (minutes)
 */

import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { applyPrivateCacheArtifactModes, preparePrivateCachePath } from "./db-paths.ts";
import { classify } from "./errclass.ts";
import { redactText } from "./redaction.ts";
import { changepoint, percentile } from "./stats.ts";

const SRC_DB =
  process.env.OPENCODE_DB ?? join(homedir(), ".local/share/opencode/opencode.db");
const CACHE_DB = process.env.OPENCODEVIEW_CACHE ?? join(import.meta.dir, "..", ".cache", "analytics.sqlite");

// ---------- args ----------
const args = process.argv.slice(2);
const listMode = args.includes("--list");
const allMode = args.includes("--all");
const gapMinIdx = args.indexOf("--gap-min");
const GAP_MIN = gapMinIdx >= 0 ? Number(args[gapMinIdx + 1]) : 30;
const GAP_MS = GAP_MIN * 60 * 1000;
const gapValue = gapMinIdx >= 0 ? args[gapMinIdx + 1] : undefined;
const selector = args.find((a) => !a.startsWith("--") && a !== gapValue);

// ---------- open source read-only ----------
function openSource(): Database {
  const db = new Database(SRC_DB, { readonly: true });
  db.exec("PRAGMA query_only = 1;");
  return db;
}

function slugOf(worktree: string | null, id: string): string {
  if (!worktree || id === "global") return id === "global" ? "global" : id.slice(0, 8);
  return basename(worktree) || id.slice(0, 8);
}

function normalizeAgent(raw: string | null | undefined): string {
  if (!raw) return "(main)";
  const cleaned = raw
    .normalize("NFC")
    .replace(/\u{200B}|\u{200C}|\u{200D}|\u{FEFF}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "(main)";
  if (!/[A-Z]/.test(cleaned)) return cleaned;
  return cleaned.replace(
    /\p{L}[\p{L}\p{M}]*/gu,
    (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
}

// ---------- list projects ----------
function listProjects(src: Database) {
  const rows = src
    .query(
      `SELECT p.id, p.worktree,
              COUNT(s.id) AS sessions,
              COALESCE(SUM(s.tokens_input+s.tokens_output+s.tokens_reasoning),0) AS tok
       FROM project p LEFT JOIN session s ON s.project_id = p.id
       GROUP BY p.id
       ORDER BY tok DESC`,
    )
    .all() as Array<{ id: string; worktree: string | null; sessions: number; tok: number }>;

  console.log(`\nProjects in configured source DB\n`);
  console.log(
    "slug".padEnd(22) + "sessions".padStart(10) + "tokens".padStart(12) + "  project_id",
  );
  console.log("-".repeat(70));
  for (const r of rows) {
    const slug = slugOf(r.worktree, r.id);
    console.log(
      slug.padEnd(22) +
        String(r.sessions).padStart(10) +
        fmtM(r.tok).padStart(12) +
        "  " +
        r.id,
    );
  }
  console.log(`\n${rows.length} projects.\n`);
}

function fmtM(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
}

// ---------- resolve project ----------
function resolveProject(src: Database, sel: string): { id: string; worktree: string | null } {
  const byId = src.query(`SELECT id, worktree FROM project WHERE id = ?`).get(sel) as
    | { id: string; worktree: string | null }
    | null;
  if (byId) return byId;
  const all = src.query(`SELECT id, worktree FROM project`).all() as Array<{
    id: string;
    worktree: string | null;
  }>;
  const hit = all.find((p) => slugOf(p.worktree, p.id) === sel);
  if (!hit) {
    console.error(`Project not found: "${sel}". Use --list to see slugs.`);
    process.exit(1);
  }
  if (!hit) throw new Error("Project not found.");
  return hit;
}

// ---------- cache schema ----------
function openCache(): Database {
  const prepared = preparePrivateCachePath({ sourcePath: SRC_DB, cachePath: CACHE_DB });
  const db = new Database(prepared.cachePath);
  db.exec("PRAGMA busy_timeout = 10000;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS project (
      project_id TEXT PRIMARY KEY, slug TEXT, worktree TEXT,
      sessions INTEGER, tokens_total INTEGER, scanned_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS session_metrics (
      session_id TEXT PRIMARY KEY, project_id TEXT, slug TEXT, title TEXT,
      parent_id TEXT, is_subagent INTEGER, agent TEXT, model TEXT,
      time_created INTEGER, time_updated INTEGER,
      tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
      tokens_cache_read INTEGER, tokens_cache_write INTEGER, cost REAL,
      summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER,
      tool_calls INTEGER, tool_errors INTEGER, tool_error_rate REAL,
      patch_count INTEGER, apply_patch_ok INTEGER, apply_patch_err INTEGER,
      compaction_count INTEGER, reasoning_parts INTEGER, text_parts INTEGER, file_parts INTEGER,
      msg_count INTEGER, assistant_msgs INTEGER, trunc_length INTEGER, avg_latency_s REAL,
      latency_sum_s REAL, latency_n INTEGER,
      active_min REAL, bursts INTEGER, max_gap_h REAL,
      flags TEXT,
      session_quality_score REAL, score_confidence REAL
    );
    CREATE INDEX IF NOT EXISTS sm_project_idx ON session_metrics(project_id);
    CREATE INDEX IF NOT EXISTS sm_created_idx ON session_metrics(time_created);
    CREATE TABLE IF NOT EXISTS session_model (
      session_id TEXT, project_id TEXT, slug TEXT,
      agent TEXT, is_subagent INTEGER, month TEXT,
      model_id TEXT, provider_id TEXT, variant TEXT,
      msgs INTEGER,
      tokens_input INTEGER, tokens_output INTEGER,
      tokens_reasoning INTEGER,
      tokens_cache_read INTEGER, tokens_cache_write INTEGER,
      PRIMARY KEY (session_id, model_id, provider_id, variant)
    );
    CREATE INDEX IF NOT EXISTS smod_project_idx ON session_model(project_id);
    CREATE INDEX IF NOT EXISTS smod_model_idx   ON session_model(model_id);
    CREATE INDEX IF NOT EXISTS smod_agent_idx   ON session_model(agent);
    CREATE INDEX IF NOT EXISTS smod_month_idx   ON session_model(month);
    CREATE TABLE IF NOT EXISTS delegation (
      parent_session_id TEXT, child_session_id TEXT, project_id TEXT, slug TEXT,
      category TEXT, requested_subagent_type TEXT, model TEXT,
      run_in_background INTEGER, status TEXT, duration_s REAL, title TEXT,
      child_adds INTEGER, child_patch_ok INTEGER,
      delegation_instant_fail INTEGER, delegation_zombie INTEGER,
      PRIMARY KEY (parent_session_id, child_session_id)
    );
    CREATE INDEX IF NOT EXISTS del_project_idx ON delegation(project_id);
    CREATE INDEX IF NOT EXISTS del_parent_idx  ON delegation(parent_session_id);
    CREATE INDEX IF NOT EXISTS del_child_idx   ON delegation(child_session_id);
    CREATE TABLE IF NOT EXISTS data_quality (
      month TEXT, field TEXT, n INTEGER, non_null INTEGER, coverage REAL, is_gap INTEGER,
      PRIMARY KEY(month,field)
    );
    CREATE TABLE IF NOT EXISTS tool_metrics (
      project_id TEXT, slug TEXT, tool TEXT, month TEXT,
      calls INTEGER, errors INTEGER, err_rate REAL, dur_p50_s REAL, dur_p95_s REAL,
      PRIMARY KEY(project_id,tool,month)
    );
    CREATE INDEX IF NOT EXISTS tool_metrics_project_idx ON tool_metrics(project_id);
    CREATE TABLE IF NOT EXISTS tool_error_class (
      project_id TEXT, tool TEXT, error_class TEXT, n INTEGER, sample TEXT,
      PRIMARY KEY(project_id,tool,error_class)
    );
    CREATE INDEX IF NOT EXISTS tool_error_class_project_idx ON tool_error_class(project_id);
    CREATE TABLE IF NOT EXISTS tool_duration_sample (
      project_id TEXT, slug TEXT, tool TEXT, duration_s REAL
    );
    CREATE INDEX IF NOT EXISTS tool_duration_sample_project_idx ON tool_duration_sample(project_id, tool);
    CREATE TABLE IF NOT EXISTS score_config (key TEXT PRIMARY KEY, value REAL);
  `);
  // idempotent migration: CREATE TABLE IF NOT EXISTS above does not alter an
  // already-existing session_metrics table, so add the dominant-model columns
  // (Lente 2) and spawn_depth (Lente 3/5) via ALTER TABLE, ignoring
  // "duplicate column" on re-run.
  for (const stmt of [
    `ALTER TABLE session_metrics ADD COLUMN dominant_model_id TEXT`,
    `ALTER TABLE session_metrics ADD COLUMN dominant_provider_id TEXT`,
    `ALTER TABLE session_metrics ADD COLUMN dominant_variant TEXT`,
    `ALTER TABLE session_metrics ADD COLUMN spawn_depth INTEGER`,
    `ALTER TABLE session_metrics ADD COLUMN latency_sum_s REAL`,
    `ALTER TABLE session_metrics ADD COLUMN latency_n INTEGER`,
    `ALTER TABLE session_metrics ADD COLUMN session_quality_score REAL`,
    `ALTER TABLE session_metrics ADD COLUMN score_confidence REAL`,
    `ALTER TABLE delegation ADD COLUMN child_adds INTEGER`,
    `ALTER TABLE delegation ADD COLUMN child_patch_ok INTEGER`,
    `ALTER TABLE delegation ADD COLUMN delegation_instant_fail INTEGER`,
    `ALTER TABLE delegation ADD COLUMN delegation_zombie INTEGER`,
  ]) {
    try {
      db.exec(stmt);
    } catch (e) {
      if (!/duplicate column/i.test(String(e))) throw e;
    }
  }
  applyPrivateCacheArtifactModes(prepared.cachePath);
  return db;
}

function closeCache(cache: Database): void {
  try {
    cache.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    applyPrivateCacheArtifactModes(CACHE_DB);
  } finally {
    cache.close();
  }
}

// spawn_depth: hops up the parent_id chain until NULL/empty/absent, 0 = root.
// Cap at 20 to guard against cycles in the source data.
const MAX_SPAWN_DEPTH = 20;
function computeSpawnDepths(rows: readonly SpawnDepthRow[]): Map<string, number> {
  const parentOf = new Map<string, string | null>();
  for (const r of rows) parentOf.set(r.id, r.parent_id && r.parent_id !== "" ? r.parent_id : null);
  const depthOf = new Map<string, number>();
  for (const r of rows) {
    if (depthOf.has(r.id)) continue;
    const chain: string[] = [];
    let cur: string | null = r.id;
    let depth = 0;
    while (cur && depth < MAX_SPAWN_DEPTH) {
      if (depthOf.has(cur)) {
        const cachedDepth = depthOf.get(cur);
        if (cachedDepth !== undefined) depth += cachedDepth;
        break;
      }
      const parent = parentOf.get(cur);
      if (!parent) break;
      chain.push(cur);
      cur = parent;
      depth++;
    }
    depthOf.set(r.id, depth);
    // backfill the chain we just walked so re-encountering these ids is O(1)
    for (let i = chain.length - 1, d = depth - 1; i >= 0; i--, d--) {
      if (!depthOf.has(chain[i])) depthOf.set(chain[i], d);
    }
  }
  return depthOf;
}

// ---------- scan one project ----------
type SpawnDepthRow = { readonly id: string; readonly parent_id: string | null };
type SqliteExistsRow = { readonly ok: number };
type SessionRow = SpawnDepthRow & {
  readonly project_id: string;
  readonly slug: string | null;
  readonly title: string | null;
  readonly agent: string | null;
  readonly model: string | null;
  readonly time_created: number;
  readonly time_updated: number;
  readonly tokens_input: number | null;
  readonly tokens_output: number | null;
  readonly tokens_reasoning: number | null;
  readonly tokens_cache_read: number | null;
  readonly tokens_cache_write: number | null;
  readonly cost: number | null;
  readonly summary_additions: number | null;
  readonly summary_deletions: number | null;
  readonly summary_files: number | null;
};
type PartAggregateRow = {
  readonly sid: string;
  readonly tool_calls: number | null;
  readonly tool_errors: number | null;
  readonly patch_count: number | null;
  readonly apply_patch_ok: number | null;
  readonly apply_patch_err: number | null;
  readonly compaction_count: number | null;
  readonly reasoning_parts: number | null;
  readonly text_parts: number | null;
  readonly file_parts: number | null;
};
type PartAggregateMetrics = Omit<PartAggregateRow, "sid">;
type MessageAggregateRow = {
  readonly sid: string;
  readonly msg_count: number | null;
  readonly assistant_msgs: number | null;
  readonly trunc_length: number | null;
  readonly avg_latency_s: number | null;
  readonly latency_sum_s: number | null;
  readonly latency_n: number | null;
};
type MessageAggregateMetrics = Omit<MessageAggregateRow, "sid">;
type WorkAggregateRow = {
  readonly sid: string;
  readonly bursts: number | null;
  readonly active_min: number | null;
  readonly max_gap_h: number | null;
};
type WorkAggregateMetrics = Omit<WorkAggregateRow, "sid">;
type ModelAggregateRow = {
  readonly sid: string;
  readonly model_id: string;
  readonly provider_id: string | null;
  readonly variant: string;
  readonly msgs: number | null;
  readonly t_in: number | null;
  readonly t_out: number | null;
  readonly t_reas: number | null;
  readonly t_cache_read: number | null;
  readonly t_cache_write: number | null;
};
type DelegationRow = {
  readonly parent_session_id: string;
  readonly child_session_id: string;
  readonly category: string | null;
  readonly requested_subagent_type: string | null;
  readonly model: string | null;
  readonly run_in_background: number | string | null;
  readonly status: string | null;
  readonly duration_s: number | null;
  readonly title: string | null;
};
type CountRow = { readonly n: number };
type ProjectAggregateRow = {
  readonly sessions: number | null;
  readonly subagents: number | null;
  readonly tool_calls: number | null;
  readonly tool_errors: number | null;
  readonly patches: number | null;
  readonly ap_ok: number | null;
  readonly ap_err: number | null;
  readonly compactions: number | null;
  readonly adds: number | null;
  readonly active_min: number | null;
  readonly tok: number | null;
};
type FlagCountRow = { readonly flags: string | null; readonly n: number };
type FlaggedSessionRow = {
  readonly title: string | null;
  readonly tool_calls: number | null;
  readonly tool_errors: number | null;
  readonly patch_count: number | null;
  readonly apply_patch_ok: number | null;
  readonly compaction_count: number | null;
  readonly flags: string | null;
};
type GlobalAggregateRow = {
  readonly sessions: number | null;
  readonly subagents: number | null;
  readonly tok: number | null;
  readonly active_min: number | null;
  readonly tool_calls: number | null;
  readonly tool_errors: number | null;
  readonly ap_ok: number | null;
  readonly ap_err: number | null;
  readonly compactions: number | null;
};
type FlagsRow = { readonly flags: string | null };
type FlaggedProjectRow = { readonly slug: string | null; readonly flagged: number };

const EMPTY_PART_AGGREGATE = {
  tool_calls: 0,
  tool_errors: 0,
  patch_count: 0,
  apply_patch_ok: 0,
  apply_patch_err: 0,
  compaction_count: 0,
  reasoning_parts: 0,
  text_parts: 0,
  file_parts: 0,
} satisfies PartAggregateMetrics;

const EMPTY_MESSAGE_AGGREGATE = {
  msg_count: 0,
  assistant_msgs: 0,
  trunc_length: 0,
  avg_latency_s: null,
  latency_sum_s: 0,
  latency_n: 0,
} satisfies MessageAggregateMetrics;

const EMPTY_WORK_AGGREGATE = {
  active_min: null,
  bursts: null,
  max_gap_h: null,
} satisfies WorkAggregateMetrics;

const EMPTY_PROJECT_AGGREGATE = {
  sessions: 0,
  subagents: 0,
  tool_calls: 0,
  tool_errors: 0,
  patches: 0,
  ap_ok: 0,
  ap_err: 0,
  compactions: 0,
  adds: 0,
  active_min: 0,
  tok: 0,
} satisfies ProjectAggregateRow;

const EMPTY_GLOBAL_AGGREGATE = {
  sessions: 0,
  subagents: 0,
  tok: 0,
  active_min: 0,
  tool_calls: 0,
  tool_errors: 0,
  ap_ok: 0,
  ap_err: 0,
  compactions: 0,
} satisfies GlobalAggregateRow;

const FALLBACK_DATA_QUALITY_GAP_MONTHS = new Set(["2026-06", "2026-07"]);

function sqliteTableExists(db: Database, table: string): boolean {
  const row = db
    .query<SqliteExistsRow, [string]>(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table);
  return row !== null;
}

function getDataQualityGapMonths(cache: Database): Set<string> | null {
  if (!sqliteTableExists(cache, "data_quality")) return null;
  const rows = cache
    .query(`SELECT DISTINCT month FROM data_quality WHERE field = 'summary_additions' AND is_gap = 1`)
    .all() as Array<{ month: string }>;
  if (rows.length === 0) return null;
  return new Set(rows.map((r) => r.month));
}

function monthOf(ts: number): string {
  return new Date(ts).toISOString().slice(0, 7);
}

function upsertCsvFlag(flags: string, flag: string, enabled: boolean): string {
  const set = new Set(flags.split(",").filter(Boolean));
  if (enabled) set.add(flag);
  else set.delete(flag);
  return [...set].join(",");
}

const DATA_QUALITY_FIELDS = [
  { field: "summary_additions", expr: "summary_additions IS NOT NULL" },
  { field: "cost", expr: "cost IS NOT NULL" },
  { field: "dominant_model_id", expr: "dominant_model_id IS NOT NULL AND dominant_model_id <> ''" },
  { field: "avg_latency_s", expr: "avg_latency_s IS NOT NULL" },
] as const;

function materializeDataQuality(cache: Database): Set<string> {
  const del = cache.prepare(`DELETE FROM data_quality`);
  const insert = cache.prepare(`
    INSERT OR REPLACE INTO data_quality (month, field, n, non_null, coverage, is_gap)
    VALUES ($month, $field, $n, $non_null, $coverage, $is_gap)
  `);
  const tx = cache.transaction(() => {
    del.run();
    for (const { field, expr } of DATA_QUALITY_FIELDS) {
      const rows = cache
        .query(
          `SELECT substr(datetime(time_created/1000,'unixepoch'),1,7) AS month,
             COUNT(*) AS n,
             SUM(CASE WHEN ${expr} THEN 1 ELSE 0 END) AS non_null
           FROM session_metrics
           GROUP BY month
           ORDER BY month ASC`,
        )
        .all() as Array<{ month: string; n: number; non_null: number }>;
      const coverage = rows.map((r) => (Number(r.n) > 0 ? Number(r.non_null ?? 0) / Number(r.n) : 0));
      const points = changepoint(coverage);
      const changepointGap = points.find((idx) => coverage[idx] < coverage[idx - 1]);
      const dropGap = coverage.findIndex((value, idx) => {
        if (idx < 3 || value >= 0.1) return false;
        const recentPeak = Math.max(...coverage.slice(Math.max(0, idx - 3), idx));
        return recentPeak >= 0.2 && value <= recentPeak * 0.25;
      });
      const gapStart = changepointGap ?? (dropGap >= 0 ? dropGap : undefined);
      for (let i = 0; i < rows.length; i++) {
        insert.run({
          $month: rows[i].month,
          $field: field,
          $n: Number(rows[i].n ?? 0),
          $non_null: Number(rows[i].non_null ?? 0),
          $coverage: coverage[i],
          $is_gap: gapStart !== undefined && i >= gapStart ? 1 : 0,
        });
      }
    }
  });
  tx();
  return getDataQualityGapMonths(cache) ?? FALLBACK_DATA_QUALITY_GAP_MONTHS;
}

function refreshDataQualityFlags(cache: Database, gapMonths: Set<string>): void {
  const rows = cache
    .query(`SELECT session_id, time_created, flags FROM session_metrics`)
    .all() as Array<{ session_id: string; time_created: number; flags: string }>;
  const update = cache.prepare(`UPDATE session_metrics SET flags = ? WHERE session_id = ?`);
  const tx = cache.transaction((items: typeof rows) => {
    for (const row of items) {
      const next = upsertCsvFlag(row.flags ?? "", "data_quality_gap", gapMonths.has(monthOf(row.time_created)));
      if (next !== (row.flags ?? "")) update.run(next, row.session_id);
    }
  });
  tx(rows);
}

function materializeToolMetrics(src: Database, cache: Database, projectId: string, slug: string): void {
  const rows = src
    .query(
      `SELECT
         COALESCE(json_extract(p.data,'$.tool'), '(unknown)') AS tool,
         substr(datetime(s.time_created/1000,'unixepoch'),1,7) AS month,
         json_extract(p.data,'$.state.status') AS status,
         json_extract(p.data,'$.state.error') AS error,
         CASE WHEN json_extract(p.data,'$.state.time.start') IS NOT NULL
                AND json_extract(p.data,'$.state.time.end') IS NOT NULL
              THEN (json_extract(p.data,'$.state.time.end') - json_extract(p.data,'$.state.time.start')) / 1000.0
              ELSE NULL END AS duration_s
       FROM session s INDEXED BY session_project_idx
       JOIN part p INDEXED BY part_session_idx ON p.session_id = s.id
       WHERE s.project_id = ?
         AND json_extract(p.data,'$.type')='tool'`,
    )
    .all(projectId) as Array<{ tool: string; month: string; status: string | null; error: string | null; duration_s: number | null }>;

  type Bucket = { calls: number; errors: number; durations: number[] };
  type ErrorBucket = { n: number; sample: string | null };
  const metricByKey = new Map<string, Bucket>();
  const errByKey = new Map<string, ErrorBucket>();
  for (const row of rows) {
    const tool = row.tool ?? "(unknown)";
    const month = row.month;
    const metricKey = `${tool}\u0000${month}`;
    const metric = metricByKey.get(metricKey) ?? { calls: 0, errors: 0, durations: [] };
    metric.calls++;
    if (row.status === "error") metric.errors++;
    if (typeof row.duration_s === "number" && Number.isFinite(row.duration_s)) metric.durations.push(row.duration_s);
    metricByKey.set(metricKey, metric);

    if (row.status !== "error") continue;
    const sample = row.error ?? "";
    const errorClass = classify(sample);
    const errKey = `${tool}\u0000${errorClass}`;
    const eb = errByKey.get(errKey) ?? { n: 0, sample: sample ? redactText(sample) : null };
    eb.n++;
    if (!eb.sample && sample) eb.sample = redactText(sample);
    errByKey.set(errKey, eb);
  }

  const delMetrics = cache.prepare(`DELETE FROM tool_metrics WHERE project_id = ?`);
  const delErr = cache.prepare(`DELETE FROM tool_error_class WHERE project_id = ?`);
  const delDur = cache.prepare(`DELETE FROM tool_duration_sample WHERE project_id = ?`);
  const insertMetric = cache.prepare(`
    INSERT OR REPLACE INTO tool_metrics (
      project_id, slug, tool, month, calls, errors, err_rate, dur_p50_s, dur_p95_s
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertErr = cache.prepare(`
    INSERT OR REPLACE INTO tool_error_class (project_id, tool, error_class, n, sample)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertDuration = cache.prepare(`INSERT INTO tool_duration_sample (project_id, slug, tool, duration_s) VALUES (?, ?, ?, ?)`);
  delMetrics.run(projectId);
  delErr.run(projectId);
  delDur.run(projectId);
  for (const [key, bucket] of metricByKey) {
    const [tool, month] = key.split("\u0000");
    const sorted = bucket.durations.sort((a, b) => a - b);
    insertMetric.run(
      projectId,
      slug,
      tool,
      month,
      bucket.calls,
      bucket.errors,
      bucket.calls > 0 ? bucket.errors / bucket.calls : 0,
      sorted.length ? percentile(sorted, 0.5) : null,
      sorted.length ? percentile(sorted, 0.95) : null,
    );
    for (const duration of sorted) insertDuration.run(projectId, slug, tool, duration);
  }
  for (const [key, bucket] of errByKey) {
    const [tool, errorClass] = key.split("\u0000");
    insertErr.run(projectId, tool, errorClass, bucket.n, bucket.sample);
  }
}

const SCORE_FEATURES = [
  "tool_error_rate",
  "compaction_count",
  "reasoning_ratio",
  "patch_count",
  "is_subagent",
  "spawn_depth",
] as const;

type ScoreFeature = (typeof SCORE_FEATURES)[number];
type ScoreFeatureMap = Record<ScoreFeature, number>;
type ScoreModel = {
  readonly bias: number;
  readonly weights: ScoreFeatureMap;
  readonly means: ScoreFeatureMap;
  readonly stds: ScoreFeatureMap;
  readonly modelConfidence: number;
};

function emptyScoreFeatureMap(): ScoreFeatureMap {
  return { tool_error_rate: 0, compaction_count: 0, reasoning_ratio: 0, patch_count: 0, is_subagent: 0, spawn_depth: 0 };
}

function sigmoid(value: number): number {
  if (value >= 35) return 1;
  if (value <= -35) return 0;
  return 1 / (1 + Math.exp(-value));
}

function scoreConfigValue(rows: ReadonlyMap<string, number>, key: string): number | null {
  const value = rows.get(key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function loadScoreModel(cache: Database): ScoreModel | null {
  const rows = cache.query(`SELECT key, value FROM score_config`).all() as Array<{ key: string; value: number }>;
  if (rows.length === 0) return null;
  const values = new Map(rows.map((row) => [row.key, Number(row.value)]));
  const bias = scoreConfigValue(values, "session_quality_score.bias");
  if (bias === null) return null;
  const weights = emptyScoreFeatureMap();
  const means = emptyScoreFeatureMap();
  const stds = emptyScoreFeatureMap();
  for (const feature of SCORE_FEATURES) {
    const weight = scoreConfigValue(values, `session_quality_score.weight.${feature}`);
    const mean = scoreConfigValue(values, `session_quality_score.mean.${feature}`);
    const std = scoreConfigValue(values, `session_quality_score.std.${feature}`);
    if (weight === null || mean === null || std === null) return null;
    weights[feature] = weight;
    means[feature] = mean;
    stds[feature] = std === 0 ? 1 : std;
  }
  const auc = scoreConfigValue(values, "session_quality_score.validation_auc");
  const accuracy = scoreConfigValue(values, "session_quality_score.validation_accuracy");
  const confidence = auc ?? accuracy;
  return { bias, weights, means, stds, modelConfidence: confidence ?? Number.NaN };
}

function applyScoreModel(model: ScoreModel | null, features: ScoreFeatureMap): { score: number | null; confidence: number | null } {
  if (!model) return { score: null, confidence: null };
  let linear = model.bias;
  for (const feature of SCORE_FEATURES) {
    linear += model.weights[feature] * ((features[feature] - model.means[feature]) / model.stds[feature]);
  }
  const score = sigmoid(linear);
  const confidence = Number.isFinite(model.modelConfidence) ? Math.max(0, Math.min(1, model.modelConfidence * Math.abs(score - 0.5) * 2)) : null;
  return { score, confidence };
}

function clearProjectCache(cache: Database, projectId: string): void {
  cache.prepare(`DELETE FROM session_metrics WHERE project_id = ?`).run(projectId);
  cache.prepare(`DELETE FROM session_model WHERE project_id = ?`).run(projectId);
  cache.prepare(`DELETE FROM delegation WHERE project_id = ?`).run(projectId);
  cache.prepare(`DELETE FROM tool_metrics WHERE project_id = ?`).run(projectId);
  cache.prepare(`DELETE FROM tool_error_class WHERE project_id = ?`).run(projectId);
  cache.prepare(`DELETE FROM tool_duration_sample WHERE project_id = ?`).run(projectId);
  cache.prepare(`DELETE FROM project WHERE project_id = ?`).run(projectId);
}

const PROJECT_SCOPED_CACHE_TABLES = [
  "session_metrics",
  "session_model",
  "delegation",
  "tool_metrics",
  "tool_error_class",
  "tool_duration_sample",
  "project",
] as const;

function clearStaleProjectCaches(cache: Database, activeProjectIds: readonly string[]): void {
  if (activeProjectIds.length === 0) {
    for (const table of PROJECT_SCOPED_CACHE_TABLES) cache.prepare(`DELETE FROM ${table}`).run();
    return;
  }
  const placeholders = activeProjectIds.map(() => "?").join(",");
  for (const table of PROJECT_SCOPED_CACHE_TABLES) {
    cache.prepare(`DELETE FROM ${table} WHERE project_id NOT IN (${placeholders})`).run(...activeProjectIds);
  }
}

function runProjectWriteTransaction(cache: Database, write: () => void): void {
  cache.exec("BEGIN IMMEDIATE");
  try {
    write();
    cache.exec("COMMIT");
  } catch (error) {
    cache.exec("ROLLBACK");
    throw error;
  }
}

function scanProject(
  src: Database,
  cache: Database,
  id: string,
  worktree: string | null,
  quiet = false,
) {
  const slug = slugOf(worktree, id);
  if (!quiet) console.log(`\nScanning project "${slug}" (${id}) ...`);
  const dataQualityGapMonths = getDataQualityGapMonths(cache);
  const scoreModel = loadScoreModel(cache);

  // 1) base session rows (index: session_project_idx)
  const sessions = src
    .query<SessionRow, [string]>(
      `SELECT id, project_id, parent_id, slug, title, agent, model,
              time_created, time_updated,
              tokens_input, tokens_output, tokens_reasoning,
              tokens_cache_read, tokens_cache_write, cost,
              summary_additions, summary_deletions, summary_files
       FROM session WHERE project_id = ?`,
    )
    .all(id);

  if (sessions.length === 0) {
    runProjectWriteTransaction(cache, () => clearProjectCache(cache, id));
    if (!quiet) console.log("  (no sessions)");
    return;
  }

  // 2) per-session PART aggregates (index-driven join, single pass)
  const partRows = src
    .query<PartAggregateRow, [string]>(
      `SELECT p.session_id AS sid,
        SUM(json_extract(p.data,'$.type')='tool') AS tool_calls,
        SUM(json_extract(p.data,'$.type')='tool' AND json_extract(p.data,'$.state.status')='error') AS tool_errors,
        SUM(json_extract(p.data,'$.type')='patch') AS patch_count,
        SUM(json_extract(p.data,'$.tool')='apply_patch' AND json_extract(p.data,'$.state.status')='completed') AS apply_patch_ok,
        SUM(json_extract(p.data,'$.tool')='apply_patch' AND json_extract(p.data,'$.state.status')='error') AS apply_patch_err,
        SUM(json_extract(p.data,'$.type')='compaction') AS compaction_count,
        SUM(json_extract(p.data,'$.type')='reasoning') AS reasoning_parts,
        SUM(json_extract(p.data,'$.type')='text') AS text_parts,
        SUM(json_extract(p.data,'$.type')='file') AS file_parts
       FROM part p JOIN session s ON s.id = p.session_id
       WHERE s.project_id = ?
       GROUP BY p.session_id`,
    )
    .all(id);
  const partBySid = new Map<string, PartAggregateRow>(partRows.map((r) => [r.sid, r]));

  // 3) per-session MESSAGE aggregates (latency, truncation, roles)
  // latency_sum_s/latency_n only count assistant messages that have BOTH
  // time.created and time.completed set (matches avg_latency_s's implicit
  // NULL-skipping via AVG, but made explicit so callers can recompute a
  // corpus-wide average as SUM(latency_sum_s)/SUM(latency_n) instead of
  // averaging per-session averages).
  const msgRows = src
    .query<MessageAggregateRow, [string]>(
      `SELECT m.session_id AS sid,
        COUNT(*) AS msg_count,
        SUM(json_extract(m.data,'$.role')='assistant') AS assistant_msgs,
        SUM(json_extract(m.data,'$.finish')='length') AS trunc_length,
        AVG(CASE WHEN json_extract(m.data,'$.role')='assistant'
                 THEN (json_extract(m.data,'$.time.completed')-json_extract(m.data,'$.time.created'))/1000.0 END) AS avg_latency_s,
        SUM(CASE WHEN json_extract(m.data,'$.role')='assistant'
                 AND json_extract(m.data,'$.time.completed') IS NOT NULL
                 AND json_extract(m.data,'$.time.created') IS NOT NULL
                 THEN (json_extract(m.data,'$.time.completed')-json_extract(m.data,'$.time.created'))/1000.0 ELSE 0 END) AS latency_sum_s,
        SUM(CASE WHEN json_extract(m.data,'$.role')='assistant'
                 AND json_extract(m.data,'$.time.completed') IS NOT NULL
                 AND json_extract(m.data,'$.time.created') IS NOT NULL
                 THEN 1 ELSE 0 END) AS latency_n
       FROM message m JOIN session s ON s.id = m.session_id
       WHERE s.project_id = ?
       GROUP BY m.session_id`,
    )
    .all(id);
  const msgBySid = new Map<string, MessageAggregateRow>(msgRows.map((r) => [r.sid, r]));

  // 4) real work-time via gap clustering (window fn, partitioned by session)
  const workRows = src
    .query<WorkAggregateRow, [string, number, number]>(
      `WITH ms AS (
         SELECT m.session_id AS sid, m.time_created AS t,
                (m.time_created - LAG(m.time_created) OVER (PARTITION BY m.session_id ORDER BY m.time_created)) AS gap
         FROM message m JOIN session s ON s.id = m.session_id
         WHERE s.project_id = ?
       )
       SELECT sid,
         1 + SUM(CASE WHEN gap > ? THEN 1 ELSE 0 END) AS bursts,
         SUM(CASE WHEN gap IS NULL OR gap > ? THEN 0 ELSE gap END)/60000.0 AS active_min,
         MAX(gap)/3600000.0 AS max_gap_h
       FROM ms GROUP BY sid`,
    )
    .all(id, GAP_MS, GAP_MS);
  const workBySid = new Map<string, WorkAggregateRow>(workRows.map((r) => [r.sid, r]));

  // 5) per-session MODEL aggregates (session_id, model_id, provider_id, variant)
  // fetched here (before the session_metrics upsert) so its per-session totals
  // can double as the "dominant model" signal, reused again below for
  // session_model without a second heavy pass.
  const modelRows = src
    .query<ModelAggregateRow, [string]>(
      `SELECT m.session_id AS sid,
        json_extract(m.data,'$.modelID')  AS model_id,
        json_extract(m.data,'$.providerID') AS provider_id,
        COALESCE(json_extract(m.data,'$.variant'),'default') AS variant,
        COUNT(*) AS msgs,
        SUM(json_extract(m.data,'$.tokens.input'))     AS t_in,
        SUM(json_extract(m.data,'$.tokens.output'))    AS t_out,
        SUM(json_extract(m.data,'$.tokens.reasoning')) AS t_reas,
        SUM(CAST(json_extract(m.data,'$.tokens.cache.read') AS INTEGER))  AS t_cache_read,
        SUM(CAST(json_extract(m.data,'$.tokens.cache.write') AS INTEGER)) AS t_cache_write
       FROM message m JOIN session s ON s.id = m.session_id
       WHERE s.project_id = ?
         AND json_extract(m.data,'$.role') = 'assistant'
         AND json_extract(m.data,'$.modelID') IS NOT NULL
       GROUP BY m.session_id, model_id, provider_id, variant`,
    )
    .all(id);

  // dominant model per session = greatest (input+output+reasoning) among that
  // session's model rows (§5 of spec).
  const dominantBySid = new Map<string, { readonly model_id: string; readonly provider_id: string | null; readonly variant: string }>();
  const dominantScoreBySid = new Map<string, number>();
  for (const r of modelRows) {
    const score = Number(r.t_in ?? 0) + Number(r.t_out ?? 0) + Number(r.t_reas ?? 0);
    const best = dominantScoreBySid.get(r.sid) ?? -Infinity;
    if (score > best) {
      dominantScoreBySid.set(r.sid, score);
      dominantBySid.set(r.sid, { model_id: r.model_id, provider_id: r.provider_id, variant: r.variant });
    }
  }

  // 6) merge + flags + upsert
  const spawnDepthBySid = computeSpawnDepths(sessions);
  const insert = cache.prepare(`
    INSERT OR REPLACE INTO session_metrics (
      session_id, project_id, slug, title, parent_id, is_subagent, agent, model,
      time_created, time_updated, tokens_input, tokens_output, tokens_reasoning,
      tokens_cache_read, tokens_cache_write, cost,
      summary_additions, summary_deletions, summary_files,
      tool_calls, tool_errors, tool_error_rate, patch_count, apply_patch_ok, apply_patch_err,
      compaction_count, reasoning_parts, text_parts, file_parts,
      msg_count, assistant_msgs, trunc_length, avg_latency_s, latency_sum_s, latency_n,
      active_min, bursts, max_gap_h, flags, session_quality_score, score_confidence,
      dominant_model_id, dominant_provider_id, dominant_variant, spawn_depth
    ) VALUES (
      $session_id, $project_id, $slug, $title, $parent_id, $is_subagent, $agent, $model,
      $time_created, $time_updated, $tokens_input, $tokens_output, $tokens_reasoning,
      $tokens_cache_read, $tokens_cache_write, $cost,
      $summary_additions, $summary_deletions, $summary_files,
      $tool_calls, $tool_errors, $tool_error_rate, $patch_count, $apply_patch_ok, $apply_patch_err,
      $compaction_count, $reasoning_parts, $text_parts, $file_parts,
      $msg_count, $assistant_msgs, $trunc_length, $avg_latency_s, $latency_sum_s, $latency_n,
      $active_min, $bursts, $max_gap_h, $flags, $session_quality_score, $score_confidence,
      $dominant_model_id, $dominant_provider_id, $dominant_variant, $spawn_depth
    )`);

  let tokTotal = 0;
  const writeSessionMetrics = (rows: readonly SessionRow[]) => {
    cache.prepare(`DELETE FROM session_metrics WHERE project_id = ?`).run(id);
    for (const s of rows) {
      const p = partBySid.get(s.id) ?? EMPTY_PART_AGGREGATE;
      const m = msgBySid.get(s.id) ?? EMPTY_MESSAGE_AGGREGATE;
      const w = workBySid.get(s.id) ?? EMPTY_WORK_AGGREGATE;
      const toolCalls = Number(p.tool_calls ?? 0);
      const toolErrors = Number(p.tool_errors ?? 0);
      const errRate = toolCalls > 0 ? toolErrors / toolCalls : 0;
      const tokensTotal =
        Number(s.tokens_input ?? 0) + Number(s.tokens_output ?? 0) + Number(s.tokens_reasoning ?? 0);
      tokTotal += tokensTotal;
      const isSub = s.parent_id && s.parent_id !== "" ? 1 : 0;
      const spawnDepth = spawnDepthBySid.get(s.id) ?? 0;
      const score = applyScoreModel(scoreModel, {
        tool_error_rate: errRate,
        compaction_count: Number(p.compaction_count ?? 0),
        reasoning_ratio: Number(s.tokens_output ?? 0) > 0 ? Number(s.tokens_reasoning ?? 0) / Number(s.tokens_output ?? 0) : 0,
        patch_count: Number(p.patch_count ?? 0),
        is_subagent: isSub,
        spawn_depth: spawnDepth,
      });
      const dom = dominantBySid.get(s.id);
      const flags = computeFlags({
        toolCalls,
        errRate,
        patch_count: Number(p.patch_count ?? 0),
        apply_patch_ok: Number(p.apply_patch_ok ?? 0),
        compaction_count: Number(p.compaction_count ?? 0),
        tokensTotal,
        summary_additions: Number(s.summary_additions ?? 0),
        trunc_length: Number(m.trunc_length ?? 0),
        title: s.title ?? "",
        time_created: Number(s.time_created ?? 0),
        dataQualityGapMonths,
      });
      insert.run({
        $session_id: s.id,
        $project_id: s.project_id,
        $slug: slug,
        $title: s.title,
        $parent_id: s.parent_id,
        $is_subagent: isSub,
        $agent: normalizeAgent(s.agent),
        $model: s.model,
        $time_created: s.time_created,
        $time_updated: s.time_updated,
        $tokens_input: s.tokens_input,
        $tokens_output: s.tokens_output,
        $tokens_reasoning: s.tokens_reasoning,
        $tokens_cache_read: s.tokens_cache_read,
        $tokens_cache_write: s.tokens_cache_write,
        $cost: s.cost,
        $summary_additions: s.summary_additions,
        $summary_deletions: s.summary_deletions,
        $summary_files: s.summary_files,
        $tool_calls: toolCalls,
        $tool_errors: toolErrors,
        $tool_error_rate: errRate,
        $patch_count: Number(p.patch_count ?? 0),
        $apply_patch_ok: Number(p.apply_patch_ok ?? 0),
        $apply_patch_err: Number(p.apply_patch_err ?? 0),
        $compaction_count: Number(p.compaction_count ?? 0),
        $reasoning_parts: Number(p.reasoning_parts ?? 0),
        $text_parts: Number(p.text_parts ?? 0),
        $file_parts: Number(p.file_parts ?? 0),
        $msg_count: Number(m.msg_count ?? 0),
        $assistant_msgs: Number(m.assistant_msgs ?? 0),
        $trunc_length: Number(m.trunc_length ?? 0),
        $avg_latency_s: m.avg_latency_s ?? null,
        $latency_sum_s: Number(m.latency_sum_s ?? 0),
        $latency_n: Number(m.latency_n ?? 0),
        $active_min: w.active_min ?? null,
        $bursts: w.bursts ?? null,
        $max_gap_h: w.max_gap_h ?? null,
        $flags: flags.join(","),
        $session_quality_score: score.score,
        $score_confidence: score.confidence,
        $dominant_model_id: dom?.model_id ?? null,
        $dominant_provider_id: dom?.provider_id ?? null,
        $dominant_variant: dom?.variant ?? null,
        $spawn_depth: spawnDepth,
      });
    }
  };
  runProjectWriteTransaction(cache, () => {
    writeSessionMetrics(sessions);

    // 7) upsert session_model from the modelRows aggregate fetched in step 5
    // (reused here, no second heavy pass over `message`).
    const sessionById = new Map<string, SessionRow>(sessions.map((s) => [s.id, s]));
    const delModel = cache.prepare(`DELETE FROM session_model WHERE project_id = ?`);
    const insertModel = cache.prepare(`
    INSERT OR REPLACE INTO session_model (
      session_id, project_id, slug, agent, is_subagent, month,
      model_id, provider_id, variant, msgs,
      tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write
    ) VALUES (
      $session_id, $project_id, $slug, $agent, $is_subagent, $month,
      $model_id, $provider_id, $variant, $msgs,
      $tokens_input, $tokens_output, $tokens_reasoning, $tokens_cache_read, $tokens_cache_write
    )`);

    const writeSessionModels = (rows: readonly ModelAggregateRow[]) => {
      delModel.run(id);
      for (const r of rows) {
        const s = sessionById.get(r.sid);
        if (!s) continue;
        const isSub = s.parent_id && s.parent_id !== "" ? 1 : 0;
        const month = new Date(Number(s.time_created ?? 0)).toISOString().slice(0, 7);
        insertModel.run({
          $session_id: r.sid,
          $project_id: id,
          $slug: slug,
          $agent: normalizeAgent(s.agent),
          $is_subagent: isSub,
          $month: month,
          $model_id: r.model_id,
          $provider_id: r.provider_id,
          $variant: r.variant,
          $msgs: Number(r.msgs ?? 0),
          $tokens_input: Number(r.t_in ?? 0),
          $tokens_output: Number(r.t_out ?? 0),
          $tokens_reasoning: Number(r.t_reas ?? 0),
          $tokens_cache_read: Number(r.t_cache_read ?? 0),
          $tokens_cache_write: Number(r.t_cache_write ?? 0),
        });
      }
    };
    writeSessionModels(modelRows);

    // 8) delegation table: one row per `task` tool-call part whose
    // state.metadata.sessionId links parent -> child session (§5.2). Field
    // locations vary across records (some only in state.input, some only in
    // state.metadata), so each column falls back across the observed shapes.
    const delegationRows = src
      .query<DelegationRow, [string]>(
        `SELECT p.session_id AS parent_session_id,
        json_extract(p.data,'$.state.metadata.sessionId') AS child_session_id,
        COALESCE(
          json_extract(p.data,'$.state.metadata.category'),
          json_extract(p.data,'$.state.input.category')
        ) AS category,
        COALESCE(
          json_extract(p.data,'$.state.metadata.agent'),
          json_extract(p.data,'$.state.input.subagent_type'),
          json_extract(p.data,'$.state.metadata.requested_subagent_type')
        ) AS requested_subagent_type,
        COALESCE(
          json_extract(p.data,'$.state.metadata.model.modelID'),
          json_extract(p.data,'$.state.input.model')
        ) AS model,
        COALESCE(
          json_extract(p.data,'$.state.metadata.run_in_background'),
          json_extract(p.data,'$.state.input.run_in_background')
        ) AS run_in_background,
        json_extract(p.data,'$.state.status') AS status,
        (json_extract(p.data,'$.state.time.end')-json_extract(p.data,'$.state.time.start'))/1000.0 AS duration_s,
        COALESCE(
          json_extract(p.data,'$.state.title'),
          json_extract(p.data,'$.state.input.description')
        ) AS title
       FROM part p JOIN session s ON s.id = p.session_id
       WHERE s.project_id = ?
         AND json_extract(p.data,'$.type')='tool' AND json_extract(p.data,'$.tool')='task'
         AND json_extract(p.data,'$.state.metadata.sessionId') IS NOT NULL`,
      )
      .all(id);

    const delDelegation = cache.prepare(`DELETE FROM delegation WHERE project_id = ?`);
    const insertDelegation = cache.prepare(`
    INSERT OR REPLACE INTO delegation (
      parent_session_id, child_session_id, project_id, slug,
      category, requested_subagent_type, model, run_in_background, status, duration_s, title,
      child_adds, child_patch_ok, delegation_instant_fail, delegation_zombie
    ) VALUES (
      $parent_session_id, $child_session_id, $project_id, $slug,
      $category, $requested_subagent_type, $model, $run_in_background, $status, $duration_s, $title,
      $child_adds, $child_patch_ok, $delegation_instant_fail, $delegation_zombie
    )`);
    const writeDelegations = (rows: readonly DelegationRow[]) => {
      delDelegation.run(id);
      for (const r of rows) {
        const child = sessionById.get(r.child_session_id);
        const childParts = partBySid.get(r.child_session_id) ?? EMPTY_PART_AGGREGATE;
        const duration = typeof r.duration_s === "number" ? r.duration_s : null;
        const status = r.status ?? null;
        insertDelegation.run({
          $parent_session_id: r.parent_session_id,
          $child_session_id: r.child_session_id,
          $project_id: id,
          $slug: slug,
          $category: r.category ?? null,
          $requested_subagent_type: r.requested_subagent_type ?? null,
          $model: r.model ?? null,
          $run_in_background: r.run_in_background === null || r.run_in_background === undefined
            ? null
            : Number(r.run_in_background) ? 1 : 0,
          $status: status,
          $duration_s: duration,
          $title: r.title ?? null,
          $child_adds: child ? Number(child.summary_additions ?? 0) : null,
          $child_patch_ok: child ? Number(childParts.apply_patch_ok ?? 0) : null,
          $delegation_instant_fail: status === "error" && duration !== null && duration < 1 ? 1 : 0,
          $delegation_zombie: status === "running" ? 1 : 0,
        });
      }
    };
    writeDelegations(delegationRows);

    materializeToolMetrics(src, cache, id, slug);

    cache
      .prepare(
        `INSERT OR REPLACE INTO project (project_id, slug, worktree, sessions, tokens_total, scanned_at)
       VALUES (?,?,?,?,?,?)`,
      )
      .run(id, slug, worktree, sessions.length, tokTotal, Date.now());
  });

  if (quiet) {
    const flagged = cache
      .query<CountRow, [string]>(`SELECT COUNT(*) n FROM session_metrics WHERE project_id = ? AND flags <> ''`)
      .get(id);
    console.log(
      `  ${slug.padEnd(22)} ${String(sessions.length).padStart(5)} sess  ${fmtM(tokTotal).padStart(8)}  ${String(flagged?.n ?? 0).padStart(4)} flagged`,
    );
  } else {
    reportProject(cache, id, slug);
  }
}

// ---------- flags ----------
function computeFlags(x: {
  toolCalls: number;
  errRate: number;
  patch_count: number;
  apply_patch_ok: number;
  compaction_count: number;
  tokensTotal: number;
  summary_additions: number;
  trunc_length: number;
  title: string;
  time_created: number;
  dataQualityGapMonths?: Set<string> | null;
}): string[] {
  const f: string[] = [];
  const t = x.title.toLowerCase();
  if (x.toolCalls >= 20 && x.errRate > 0.3) f.push("tool_failure_loop");
  if (x.patch_count > 50 && x.apply_patch_ok === 0 && x.summary_additions === 0)
    f.push("patch_waste");
  if (x.compaction_count > 15) f.push("context_pressure");
  if (x.trunc_length > 0) f.push("truncation");
  if (t.startsWith("undefined")) f.push("omo_metadata_bug");
  if (t.includes("injection") || t.includes("malicious") || t.includes("i'm claude code"))
    f.push("security_anomaly");
  if (x.tokensTotal > 1e6 && x.summary_additions === 0 && x.apply_patch_ok === 0)
    f.push("low_yield_high_cost");
  const gapMonths = x.dataQualityGapMonths ?? FALLBACK_DATA_QUALITY_GAP_MONTHS;
  if (gapMonths.has(monthOf(x.time_created))) f.push("data_quality_gap");
  return f;
}

// ---------- project report ----------
function reportProject(cache: Database, id: string, slug: string) {
  const agg = cache
    .query<ProjectAggregateRow, [string]>(
      `SELECT COUNT(*) sessions,
        SUM(is_subagent) subagents,
        SUM(tool_calls) tool_calls, SUM(tool_errors) tool_errors,
        SUM(patch_count) patches, SUM(apply_patch_ok) ap_ok, SUM(apply_patch_err) ap_err,
        SUM(compaction_count) compactions,
        SUM(summary_additions) adds,
        SUM(active_min) active_min,
        SUM(tokens_input+tokens_output+tokens_reasoning) tok
       FROM session_metrics WHERE project_id = ?`,
    )
    .get(id) ?? EMPTY_PROJECT_AGGREGATE;

  const toolCalls = Number(agg.tool_calls ?? 0);
  const toolErrors = Number(agg.tool_errors ?? 0);
  const apOk = Number(agg.ap_ok ?? 0);
  const apErr = Number(agg.ap_err ?? 0);
  const errRate = toolCalls > 0 ? (100 * toolErrors) / toolCalls : 0;
  const apTotal = apOk + apErr;
  const apPrec = apTotal > 0 ? (100 * apOk) / apTotal : 0;

  console.log(`\n== ${slug} ==`);
  console.log(`  sessions........... ${agg.sessions} (${agg.subagents} subagents)`);
  console.log(`  tokens............. ${fmtM(Number(agg.tok))}`);
  console.log(`  active time........ ${(Number(agg.active_min) / 60).toFixed(1)} h`);
  console.log(
    `  tool calls......... ${toolCalls} (${toolErrors} errors, ${errRate.toFixed(1)}%)`,
  );
  console.log(
    `  apply_patch........ ${apOk}/${apTotal} ok (${apPrec.toFixed(1)}% first-attempt precision)`,
  );
  console.log(`  compactions........ ${agg.compactions}`);
  console.log(`  additions (diff)... ${agg.adds}`);

  const flagged = cache
    .query<FlagCountRow, [string]>(
      `SELECT flags, COUNT(*) n FROM session_metrics
       WHERE project_id = ? AND flags <> '' GROUP BY flags ORDER BY n DESC`,
    )
    .all(id);
  const flagCount = new Map<string, number>();
  for (const r of flagged)
    for (const fl of String(r.flags).split(","))
      if (fl) flagCount.set(fl, (flagCount.get(fl) ?? 0) + Number(r.n));
  if (flagCount.size) {
    console.log(`  flags:`);
    for (const [k, v] of [...flagCount.entries()].sort((a, b) => b[1] - a[1]))
      console.log(`    - ${k.padEnd(22)} ${v}`);
  }

  const top = cache
    .query<FlaggedSessionRow, [string]>(
      `SELECT substr(title,1,44) title, tool_calls, tool_errors, patch_count,
              apply_patch_ok, compaction_count, flags
       FROM session_metrics WHERE project_id = ? AND flags <> ''
       ORDER BY (tokens_input+tokens_output+tokens_reasoning) DESC LIMIT 8`,
    )
    .all(id);
  if (top.length) {
    console.log(`\n  Flagged sessions (top by tokens):`);
    for (const r of top)
      console.log(
        `    • ${String(r.title).padEnd(46)} tc=${r.tool_calls} err=${r.tool_errors} patch=${r.patch_count} apok=${r.apply_patch_ok} comp=${r.compaction_count}  [${r.flags}]`,
      );
  }
  console.log(`\n  cache: configured cache DB\n`);
}

// ---------- global report ----------
function reportGlobal(cache: Database) {
  const g = cache
    .query<GlobalAggregateRow, []>(
      `SELECT COUNT(*) sessions, SUM(is_subagent) subagents,
        SUM(tokens_input+tokens_output+tokens_reasoning) tok,
        SUM(active_min) active_min,
        SUM(tool_calls) tool_calls, SUM(tool_errors) tool_errors,
        SUM(apply_patch_ok) ap_ok, SUM(apply_patch_err) ap_err,
        SUM(compaction_count) compactions
       FROM session_metrics`,
    )
    .get() ?? EMPTY_GLOBAL_AGGREGATE;
  const nProj = cache.query<CountRow, []>(`SELECT COUNT(*) n FROM project`).get()?.n ?? 0;
  const toolCalls = Number(g.tool_calls ?? 0);
  const toolErrors = Number(g.tool_errors ?? 0);
  const apOk = Number(g.ap_ok ?? 0);
  const apErr = Number(g.ap_err ?? 0);
  const errRate = toolCalls > 0 ? (100 * toolErrors) / toolCalls : 0;
  const apTot = apOk + apErr;
  const apPrec = apTot > 0 ? (100 * apOk) / apTot : 0;

  console.log(`\n===== GLOBAL (cache) =====`);
  console.log(`  projects........... ${nProj}`);
  console.log(`  sessions........... ${g.sessions} (${g.subagents} subagents)`);
  console.log(`  tokens............. ${fmtM(Number(g.tok))}`);
  console.log(`  active time........ ${(Number(g.active_min) / 60).toFixed(0)} h`);
  console.log(`  tool calls......... ${toolCalls} (${errRate.toFixed(1)}% error)`);
  console.log(`  apply_patch prec... ${apPrec.toFixed(1)}% (${apOk}/${apTot})`);
  console.log(`  compactions........ ${g.compactions}`);

  const flags = cache
    .query<FlagsRow, []>(`SELECT flags FROM session_metrics WHERE flags <> ''`)
    .all();
  const fc = new Map<string, number>();
  for (const r of flags)
    for (const fl of String(r.flags).split(","))
      if (fl) fc.set(fl, (fc.get(fl) ?? 0) + 1);
  console.log(`  flags (all sessions):`);
  for (const [k, v] of [...fc.entries()].sort((a, b) => b[1] - a[1]))
    console.log(`    - ${k.padEnd(22)} ${v}`);

  console.log(`\n  Top projects by flagged sessions:`);
  const worst = cache
    .query<FlaggedProjectRow, []>(
      `SELECT slug, COUNT(*) flagged FROM session_metrics
       WHERE flags <> '' GROUP BY slug ORDER BY flagged DESC LIMIT 10`,
    )
    .all();
  for (const r of worst) console.log(`    ${String(r.slug).padEnd(22)} ${r.flagged}`);
  console.log(`\n  cache: configured cache DB\n`);
}

// ---------- main ----------
if (import.meta.main) {
const src = openSource();
try {
  if (allMode) {
    const cache = openCache();
    const projects = src
      .query(
        `SELECT p.id, p.worktree
         FROM project p JOIN session s ON s.project_id = p.id
         GROUP BY p.id
         ORDER BY SUM(s.tokens_input+s.tokens_output+s.tokens_reasoning) DESC`,
      )
      .all() as Array<{ id: string; worktree: string | null }>;
    const t0 = Date.now();
    console.log(`\nScanning ${projects.length} projects (project-first, read-only)...`);
    runProjectWriteTransaction(cache, () => clearStaleProjectCaches(cache, projects.map((p) => p.id)));
    let done = 0;
    for (const p of projects) {
      scanProject(src, cache, p.id, p.worktree, true);
      done++;
      if (done % 20 === 0) console.log(`  ...${done}/${projects.length}`);
    }
    const gapMonths = materializeDataQuality(cache);
    refreshDataQualityFlags(cache, gapMonths);
    console.log(`\nCompleted in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    reportGlobal(cache);
    closeCache(cache);
  } else if (listMode || !selector) {
    listProjects(src);
  } else {
    const cache = openCache();
    const proj = resolveProject(src, selector);
    scanProject(src, cache, proj.id, proj.worktree);
    closeCache(cache);
  }
} finally {
  src.close();
}
}
