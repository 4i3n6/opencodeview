import { describe, test, expect, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { wilson, percentile } from "./stats.ts";

// server.ts opens its two SQLite connections from OPENCODEVIEW_CACHE /
// OPENCODE_DB at module-load time, so each schema variant needs its own
// fresh module instance. Static `import` is hoisted (would run before we can
// set env vars / build fixtures), so every variant is loaded via a dynamic
// `import("./server.ts?<tag>")` — the query string gives bun a distinct
// module cache key, forcing real re-evaluation instead of a cached reuse.

const workdir = mkdtempSync(join(tmpdir(), "opencodeview-server-test-"));
afterAll(() => {
  delete process.env.OPENCODEVIEW_CACHE;
  delete process.env.OPENCODE_DB;
  delete process.env.OH_MY_OPENCODE_LOG;
  delete process.env.PORT;
  rmSync(workdir, { recursive: true, force: true });
});

const MINUTE_MS = 60_000;
const LIVE_TEST_NOW = Date.parse("2026-07-21T12:00:00.000Z");
const LIVE_FIXTURE_NOW = Date.parse("2026-07-21T12:20:00.000Z");
const LIVE_FIXTURE_TERMINAL_AT = LIVE_FIXTURE_NOW - 20 * MINUTE_MS;

function insertRow(d: Database, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  d.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`).run(
    ...cols.map((k) => row[k] as never),
  );
}

const SESSION_METRICS_BASE_DDL = `
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
  active_min REAL, bursts INTEGER, max_gap_h REAL, flags TEXT,
  dominant_model_id TEXT, dominant_provider_id TEXT, dominant_variant TEXT, spawn_depth INTEGER`;

const DELEGATION_BASE_DDL = `
  parent_session_id TEXT, child_session_id TEXT, project_id TEXT, slug TEXT,
  category TEXT, requested_subagent_type TEXT, model TEXT,
  run_in_background INTEGER, status TEXT, duration_s REAL, title TEXT`;

const SESSIONS = [
  {
    session_id: "root", parent_id: null, is_subagent: 0, spawn_depth: 0,
    agent: "primary", model_id: "model-root",
    tool_calls: 4, tool_errors: 0, apply_patch_ok: 1, apply_patch_err: 0,
    tokens_input: 1_000, tokens_output: 100, tokens_reasoning: 0,
    avg_latency_s: 1, latency_sum_s: 4, latency_n: 4,
    active_min: 1, summary_additions: 10,
  },
  {
    session_id: "s1", parent_id: "s0", is_subagent: 1, spawn_depth: 1,
    agent: "coder", model_id: "model-a",
    tool_calls: 10, tool_errors: 2, apply_patch_ok: 3, apply_patch_err: 1,
    tokens_input: 100, tokens_output: 50, tokens_reasoning: 10,
    avg_latency_s: 10, latency_sum_s: 100, latency_n: 10,
    active_min: 5, summary_additions: 5,
  },
  {
    session_id: "s2", parent_id: "s0", is_subagent: 1, spawn_depth: 1,
    agent: "coder", model_id: "model-a",
    tool_calls: 20, tool_errors: 0, apply_patch_ok: 5, apply_patch_err: 0,
    tokens_input: 200, tokens_output: 100, tokens_reasoning: 20,
    avg_latency_s: 20, latency_sum_s: 400, latency_n: 20,
    active_min: 10, summary_additions: 0,
  },
  {
    session_id: "s3", parent_id: "s0", is_subagent: 1, spawn_depth: 1,
    agent: "reviewer", model_id: "model-b",
    tool_calls: 5, tool_errors: 5, apply_patch_ok: 0, apply_patch_err: 2,
    tokens_input: 50, tokens_output: 25, tokens_reasoning: 5,
    avg_latency_s: 5, latency_sum_s: 25, latency_n: 5,
    active_min: 2, summary_additions: 0,
  },
] as const;

const DELEGATIONS = [
  { parent: "s0", child: "s1", category: "coding", requested_subagent_type: "explore", status: "completed", duration_s: 50, title: "d1", child_adds: 100, child_patch_ok: 2, instant_fail: 0, zombie: 0 },
  { parent: "s0", child: "s2", category: "coding", requested_subagent_type: "explore", status: "completed", duration_s: 80, title: "d2", child_adds: 200, child_patch_ok: 3, instant_fail: 0, zombie: 0 },
  { parent: "s0", child: "s3", category: "review", requested_subagent_type: "reviewer-type", status: "error", duration_s: 0, title: "d3-instant-fail", child_adds: 0, child_patch_ok: 0, instant_fail: 1, zombie: 0 },
  { parent: "s0", child: "s4", category: "review", requested_subagent_type: "reviewer-type", status: "running", duration_s: null as number | null, title: "d4-zombie", child_adds: 0, child_patch_ok: 0, instant_fail: 0, zombie: 1 },
] as const;

function seed(d: Database, full: boolean) {
  d.exec(`CREATE TABLE project (project_id TEXT PRIMARY KEY, slug TEXT, worktree TEXT, sessions INTEGER, tokens_total INTEGER, scanned_at INTEGER)`);
  d.exec(`CREATE TABLE session_metrics (${SESSION_METRICS_BASE_DDL}${full ? ", latency_sum_s REAL, latency_n INTEGER" : ""})`);
  d.exec(`CREATE TABLE session_model (
    session_id TEXT, project_id TEXT, slug TEXT, agent TEXT, is_subagent INTEGER, month TEXT,
    model_id TEXT, provider_id TEXT, variant TEXT, msgs INTEGER,
    tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
    tokens_cache_read INTEGER, tokens_cache_write INTEGER,
    PRIMARY KEY (session_id, model_id, provider_id, variant)
  )`);
  d.exec(
    `CREATE TABLE delegation (${DELEGATION_BASE_DDL}${
      full ? ", child_adds INTEGER, child_patch_ok INTEGER, delegation_instant_fail INTEGER, delegation_zombie INTEGER" : ""
    }, PRIMARY KEY (parent_session_id, child_session_id))`,
  );
  if (full) {
    d.exec(`CREATE TABLE tool_metrics (project_id TEXT, slug TEXT, tool TEXT, month TEXT, calls INTEGER, errors INTEGER, err_rate REAL, dur_p50_s REAL, dur_p95_s REAL, PRIMARY KEY(project_id,tool,month))`);
    d.exec(`CREATE TABLE tool_error_class (project_id TEXT, tool TEXT, error_class TEXT, n INTEGER, sample TEXT, PRIMARY KEY(project_id,tool,error_class))`);
    d.exec(`CREATE TABLE data_quality (month TEXT, field TEXT, n INTEGER, non_null INTEGER, coverage REAL, is_gap INTEGER, PRIMARY KEY(month,field))`);
  }

  insertRow(d, "project", { project_id: "p1", slug: "proj-a", worktree: "/tmp/proj-a", sessions: 4, tokens_total: 1660, scanned_at: 1700000000 });

  for (const s of SESSIONS) {
    const row: Record<string, unknown> = {
      session_id: s.session_id, project_id: "p1", slug: "proj-a", title: `title-${s.session_id}`,
      parent_id: s.parent_id, is_subagent: s.is_subagent, agent: s.agent, model: s.model_id,
      time_created: 1700000000, time_updated: 1700000100,
      tokens_input: s.tokens_input, tokens_output: s.tokens_output, tokens_reasoning: s.tokens_reasoning,
      tokens_cache_read: 0, tokens_cache_write: 0, cost: 0,
      summary_additions: s.summary_additions, summary_deletions: 0, summary_files: 0,
      tool_calls: s.tool_calls, tool_errors: s.tool_errors, tool_error_rate: s.tool_errors / s.tool_calls,
      patch_count: 0, apply_patch_ok: s.apply_patch_ok, apply_patch_err: s.apply_patch_err,
      compaction_count: 0, reasoning_parts: 0, text_parts: 0, file_parts: 0,
      msg_count: 10, assistant_msgs: 5, trunc_length: 0, avg_latency_s: s.avg_latency_s,
      active_min: s.active_min, bursts: 1, max_gap_h: 0, flags: "",
      dominant_model_id: s.model_id, dominant_provider_id: "prov", dominant_variant: "default", spawn_depth: s.spawn_depth,
    };
    if (full) {
      row.latency_sum_s = s.latency_sum_s;
      row.latency_n = s.latency_n;
    }
    insertRow(d, "session_metrics", row);
    insertRow(d, "session_model", {
      session_id: s.session_id, project_id: "p1", slug: "proj-a",
      agent: s.agent, is_subagent: s.is_subagent, month: "2026-01",
      model_id: s.model_id, provider_id: "prov", variant: "default",
      msgs: 5, tokens_input: s.tokens_input, tokens_output: s.tokens_output, tokens_reasoning: s.tokens_reasoning,
      tokens_cache_read: 0, tokens_cache_write: 0,
    });
  }

  for (const dl of DELEGATIONS) {
    const row: Record<string, unknown> = {
      parent_session_id: dl.parent, child_session_id: dl.child, project_id: "p1", slug: "proj-a",
      category: dl.category, requested_subagent_type: dl.requested_subagent_type, model: null,
      run_in_background: 0, status: dl.status, duration_s: dl.duration_s, title: dl.title,
    };
    if (full) {
      row.child_adds = dl.child_adds;
      row.child_patch_ok = dl.child_patch_ok;
      row.delegation_instant_fail = dl.instant_fail;
      row.delegation_zombie = dl.zombie;
    }
    insertRow(d, "delegation", row);
  }

  if (full) {
    insertRow(d, "tool_metrics", { project_id: "p1", slug: "proj-a", tool: "bash", month: "2026-01", calls: 10, errors: 1, err_rate: 0.1, dur_p50_s: 1.0, dur_p95_s: 5.0 });
    insertRow(d, "tool_metrics", { project_id: "p1", slug: "proj-a", tool: "bash", month: "2026-02", calls: 5, errors: 0, err_rate: 0, dur_p50_s: 2.0, dur_p95_s: 6.0 });
    insertRow(d, "tool_error_class", { project_id: "p1", tool: "bash", error_class: "timeout", n: 3, sample: "Command timed out after 30s" });
    insertRow(d, "tool_error_class", { project_id: "p1", tool: "bash", error_class: "permission_denied", n: 1, sample: "Permission denied" });
    insertRow(d, "data_quality", { month: "2026-06", field: "summary_additions", n: 100, non_null: 1, coverage: 0.01, is_gap: 1 });
    insertRow(d, "data_quality", { month: "2026-01", field: "summary_additions", n: 100, non_null: 95, coverage: 0.95, is_gap: 0 });
  }
}

function buildFixture(name: string, full: boolean): { cachePath: string; srcPath: string; logPath: string } {
  const cachePath = join(workdir, `${name}-cache.sqlite`);
  const srcPath = join(workdir, `${name}-src.sqlite`);
  const logPath = join(workdir, `${name}-live.log`);
  const cache = new Database(cachePath);
  seed(cache, full);
  cache.close();
  const src = new Database(srcPath);
  src.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT)`);
  src.exec(`CREATE TABLE session (
    id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, title TEXT, agent TEXT, model TEXT, directory TEXT,
    time_created INTEGER, time_updated INTEGER,
    tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER,
    tokens_cache_read INTEGER, tokens_cache_write INTEGER, cost REAL,
    summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER
  )`);
  src.exec(`CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT)`);
  src.exec(`CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT, message_id TEXT, time_created INTEGER, data TEXT)`);
  insertRow(src, "project", { id: "p-live", worktree: "/tmp/live-project" });
  insertRow(src, "session", {
    id: "live-root", project_id: "p-live", parent_id: null, title: "live root", agent: "primary", model: "model-root",
    directory: "/tmp/live-project", time_created: LIVE_FIXTURE_NOW - 30 * MINUTE_MS,
    time_updated: LIVE_FIXTURE_NOW - 2 * MINUTE_MS, tokens_input: 10, tokens_output: 1, tokens_reasoning: 0,
    tokens_cache_read: 0, tokens_cache_write: 0, cost: 0, summary_additions: 0, summary_deletions: 0,
    summary_files: 0,
  });
  insertRow(src, "session", {
    id: "live-terminal", project_id: "p-live", parent_id: "live-root", title: "terminal child",
    agent: "explore", model: "model-child", directory: "/tmp/live-project",
    time_created: LIVE_FIXTURE_NOW - 25 * MINUTE_MS, time_updated: LIVE_FIXTURE_NOW - MINUTE_MS,
    tokens_input: 20, tokens_output: 2, tokens_reasoning: 0, tokens_cache_read: 0, tokens_cache_write: 0,
    cost: 0, summary_additions: 0, summary_deletions: 0, summary_files: 0,
  });
  src.close();
  writeFileSync(
    logPath,
    `[${new Date(LIVE_FIXTURE_TERMINAL_AT).toISOString()}] [task] Poll inactivity timeout reached {"sessionID":"live-terminal","sessionStatus":"busy","elapsed":"10s","inactiveElapsed":"1200s","toolCalls":1}\n`,
  );
  return { cachePath, srcPath, logPath };
}

async function loadServer(tag: string, full: boolean) {
  const { cachePath, srcPath, logPath } = buildFixture(tag, full);
  process.env.OPENCODEVIEW_CACHE = cachePath;
  process.env.OPENCODE_DB = srcPath;
  process.env.OH_MY_OPENCODE_LOG = logPath;
  process.env.PORT = "0";
  return import(`./server.ts?${tag}`);
}

async function getJson(mod: Awaited<ReturnType<typeof loadServer>>, path: string) {
  const res = await mod.default.fetch(new Request(`http://localhost${path}`));
  expect(res.status).toBe(200);
  const text = await res.text();
  expect(text).not.toMatch(/:\s*(NaN|-?Infinity)\b/);
  return JSON.parse(text);
}

type JsonRow = Record<string, unknown>;

function isJsonRow(value: unknown): value is JsonRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getRows(mod: Awaited<ReturnType<typeof loadServer>>, path: string): Promise<JsonRow[]> {
  const value: unknown = await getJson(mod, path);
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value)) throw new TypeError("expected JSON array");
  const rows: JsonRow[] = [];
  for (const row of value) {
    expect(isJsonRow(row)).toBe(true);
    if (!isJsonRow(row)) throw new TypeError("expected JSON object row");
    rows.push(row);
  }
  return rows;
}

function valuesFor(rows: JsonRow[], field: string): string[] {
  return rows.map((row) => String(row[field])).sort();
}

function expectOnlyValues(rows: JsonRow[], field: string, values: string[]) {
  expect(valuesFor(rows, field)).toEqual([...values].sort());
}

function requireRow(rows: JsonRow[], field: string, value: string): JsonRow {
  const row = rows.find((candidate) => candidate[field] === value);
  expect(row).toBeTruthy();
  if (!row) throw new TypeError(`missing ${field}=${value}`);
  return row;
}

describe("pure helpers", async () => {
  const mod = await loadServer("helpers", true);
  type LiveHealthInput = {
    readonly now: number;
    readonly hasParent: boolean;
    readonly dbLastUpdate: number;
    readonly logLastSeenAt: number | null;
    readonly logInactiveS: number | null;
    readonly terminalEvent: string | null;
    readonly terminalEventAt: number | null;
    readonly toolCalls: number;
    readonly toolErrors: number;
    readonly isComplete: boolean;
    readonly hasDbError: boolean;
  };
  const baseLiveHealthInput: LiveHealthInput = {
    now: LIVE_TEST_NOW,
    hasParent: true,
    dbLastUpdate: LIVE_TEST_NOW - 30_000,
    logLastSeenAt: LIVE_TEST_NOW - 1_000,
    logInactiveS: 0,
    terminalEvent: null,
    terminalEventAt: null,
    toolCalls: 0,
    toolErrors: 0,
    isComplete: false,
    hasDbError: false,
  };

  function liveHealthInput(overrides: Partial<LiveHealthInput>): LiveHealthInput {
    return { ...baseLiveHealthInput, ...overrides };
  }

  test("ratio: null on zero/negative denominator, never NaN/Infinity", () => {
    expect(mod.ratio(10, 2)).toBe(5);
    expect(mod.ratio(10, 0)).toBeNull();
    expect(mod.ratio(0, 0)).toBeNull();
    expect(mod.ratio(null, undefined)).toBeNull();
  });

  test("sortedNums: drops null/undefined/non-finite, sorts ascending", () => {
    expect(mod.sortedNums([3, null, 1, undefined, 2, NaN, Infinity])).toEqual([1, 2, 3]);
  });

  test("pct: null on empty input, matches stats.percentile otherwise", () => {
    expect(mod.pct([], 0.5)).toBeNull();
    const arr = [10, 20, 30, 40];
    expect(mod.pct(arr, 0.5)).toBe(percentile(arr, 0.5));
    expect(mod.pct(arr, 0.9)).toBe(percentile(arr, 0.9));
  });

  test("groupSorted: buckets by key and sorts each bucket", () => {
    const grouped = mod.groupSorted([
      { key: "a", value: 3 },
      { key: "a", value: 1 },
      { key: "b", value: 5 },
      { key: "a", value: null },
    ]);
    expect(grouped.get("a")).toEqual([1, 3]);
    expect(grouped.get("b")).toEqual([5]);
  });

  test("tableColumns: returns an empty set when a table does not exist", () => {
    const database = new Database(":memory:");
    try {
      expect(mod.tableColumns(database, "missing_table")).toEqual(new Set());
    } finally {
      database.close();
    }
  });

  test("wilsonOrNull: null bounds for n<=0, matches stats.wilson otherwise", () => {
    expect(mod.wilsonOrNull(0, 0)).toEqual({ lo: null, hi: null });
    const w = wilson(2, 30);
    expect(mod.wilsonOrNull(2, 30)).toEqual({ lo: w.lo, hi: w.hi });
  });

  test("scopedProjectClause: resolves a bare slug to project_id for tables without a slug column", () => {
    const pidOnly = new Set(["project_id", "tool"]);
    const clause = mod.scopedProjectClause(pidOnly, "proj-a");
    expect(clause.clause).toBe("project_id = ?");
    expect(clause.values).toEqual(["p1"]);
  });

  test("live health: Given completed delegated session When classified Then health is done", () => {
    expect(mod.classifyHealth(liveHealthInput({ isComplete: true, hasParent: true }))).toBe("done");
  });

  test("live health: Given completed root session When classified Then health is idle", () => {
    expect(mod.classifyHealth(liveHealthInput({ isComplete: true, hasParent: false }))).toBe("idle");
  });

  test("live health: Given active poller and five minute DB inactivity When classified Then delegated health is red", () => {
    const input = liveHealthInput({
      dbLastUpdate: LIVE_TEST_NOW - 5 * MINUTE_MS,
      logLastSeenAt: LIVE_TEST_NOW - 1_000,
      logInactiveS: 0,
    });

    expect(mod.computeInactiveMs(input)).toBe(5 * MINUTE_MS);
    expect(mod.classifyHealth(input)).toBe("red");
  });

  test("live health: Given stale poller without terminal event When message completion is inconclusive Then delegated health is done", () => {
    expect(mod.classifyHealth(liveHealthInput({
      dbLastUpdate: LIVE_TEST_NOW - 9 * MINUTE_MS,
      logLastSeenAt: LIVE_TEST_NOW - 11 * MINUTE_MS,
      logInactiveS: 0,
    }))).toBe("done");
  });

  test("live health: Given any terminal event When message completion is inconclusive Then delegated health is done", () => {
    expect(mod.classifyHealth(liveHealthInput({
      dbLastUpdate: LIVE_TEST_NOW - 7 * MINUTE_MS,
      logLastSeenAt: LIVE_TEST_NOW - 20 * MINUTE_MS,
      terminalEvent: "poll_timeout",
      terminalEventAt: LIVE_TEST_NOW - 20 * MINUTE_MS,
    }))).toBe("done");
  });

  test("live health: Given recent completed delegated session with terminal error When classified Then documented red behavior remains", () => {
    expect(mod.classifyHealth(liveHealthInput({
      isComplete: true,
      hasParent: true,
      terminalEvent: "terminal_error",
      terminalEventAt: LIVE_TEST_NOW - MINUTE_MS,
    }))).toBe("red");
  });

  test("live health: Given terminal event fixture When requesting /api/live since 180 Then response preserves terminal_event and no-store", async () => {
    const originalNow = Date.now;
    Date.now = () => LIVE_FIXTURE_NOW;
    try {
      const response = await mod.default.fetch(new Request("http://localhost/api/live?since_min=180"));
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      const body: unknown = await response.json();
      expect(isJsonRow(body)).toBe(true);
      if (!isJsonRow(body)) throw new TypeError("expected /api/live object response");
      expect(body.since_min).toBe(180);
      const nodes = body.nodes;
      expect(Array.isArray(nodes)).toBe(true);
      if (!Array.isArray(nodes)) throw new TypeError("expected /api/live nodes array");
      const terminalNode = nodes.find((node): node is JsonRow => isJsonRow(node) && node.session_id === "live-terminal");
      expect(terminalNode).toMatchObject({
        session_id: "live-terminal",
        parent_id: "live-root",
        health: "done",
        terminal_event: "poll_timeout",
      });
    } finally {
      Date.now = originalNow;
    }
  });
});

describe("full schema (engine migration applied)", async () => {
  const mod = await loadServer("full", true);

  test("/api/efficiency adds tokens_p50/p90 and latency_p50/p95 without dropping existing fields", async () => {
    const rows = await getJson(mod, "/api/efficiency?dimension=model&project=proj-a");
    const modelA = rows.find((r: any) => r.key === "model-a");
    expect(modelA).toBeTruthy();
    // existing contract fields still present
    expect(modelA.total_tokens).toBe(480);
    expect(modelA.sessions).toBe(2);
    // new percentile fields, cross-checked against stats.percentile directly
    expect(modelA.tokens_p50).toBe(percentile([160, 320], 0.5));
    expect(modelA.tokens_p90).toBe(percentile([160, 320], 0.9));
    expect(modelA.latency_p50).toBe(percentile([10, 20], 0.5));
    expect(modelA.latency_p95).toBe(percentile([10, 20], 0.95));
  });

  test("/api/efficiency honors subagent cohort filters", async () => {
    const rootRows = await getRows(mod, "/api/efficiency?dimension=agent&project=proj-a&subagent=0");
    expectOnlyValues(rootRows, "key", ["primary"]);
    const primary = requireRow(rootRows, "key", "primary");
    expect(primary.sessions).toBe(1);
    expect(primary.total_tokens).toBe(1100);

    const subagentRows = await getRows(mod, "/api/efficiency?dimension=agent&project=proj-a&subagent=1");
    expectOnlyValues(subagentRows, "key", ["coder", "reviewer"]);
  });

  test("/api/efficiency/quality adds Wilson bounds + rank_lo + percentiles", async () => {
    const rows = await getJson(mod, "/api/efficiency/quality?dimension=agent&project=proj-a");
    const coder = rows.find((r: any) => r.key === "coder");
    expect(coder.tool_error_rate).toBeCloseTo(2 / 30, 10);
    const w = wilson(2, 30);
    expect(coder.tool_error_rate_lo).toBe(w.lo);
    expect(coder.tool_error_rate_hi).toBe(w.hi);
    const precW = wilson(8, 9);
    expect(coder.apply_patch_precision_lo).toBe(precW.lo);
    expect(coder.rank_lo).toBe(coder.apply_patch_precision_lo);
    expect(coder.tokens_p50).toBe(percentile([160, 320], 0.5));

    const reviewer = rows.find((r: any) => r.key === "reviewer");
    // apply_patch_ok=0, apply_patch_err=2 -> denom>0 -> bounds must NOT be null
    expect(reviewer.apply_patch_precision).toBe(0);
    expect(reviewer.apply_patch_precision_lo).not.toBeNull();
  });

  test("/api/efficiency/quality honors subagent cohort filters", async () => {
    const rootRows = await getRows(mod, "/api/efficiency/quality?dimension=agent&project=proj-a&subagent=0");
    expectOnlyValues(rootRows, "key", ["primary"]);
    const primary = requireRow(rootRows, "key", "primary");
    expect(primary.sessions).toBe(1);
    expect(primary.tokens_per_session).toBe(1100);

    const subagentRows = await getRows(mod, "/api/efficiency/quality?dimension=agent&project=proj-a&subagent=1");
    expectOnlyValues(subagentRows, "key", ["coder", "reviewer"]);
  });

  test("/api/efficiency/frontier adds Wilson bounds per dominant model", async () => {
    const rows = await getJson(mod, "/api/efficiency/frontier?project=proj-a");
    const a = rows.find((r: any) => r.model === "model-a");
    const w = wilson(2, 30);
    expect(a.tool_error_rate_lo).toBe(w.lo);
    expect(a.tool_error_rate_hi).toBe(w.hi);
  });

  test("/api/efficiency/frontier honors subagent cohort filters", async () => {
    const rootRows = await getRows(mod, "/api/efficiency/frontier?project=proj-a&subagent=0");
    expectOnlyValues(rootRows, "model", ["model-root"]);
    const rootModel = requireRow(rootRows, "model", "model-root");
    expect(rootModel.sessions).toBe(1);
    expect(rootModel.tokens_per_session).toBe(1100);

    const subagentRows = await getRows(mod, "/api/efficiency/frontier?project=proj-a&subagent=1");
    expectOnlyValues(subagentRows, "model", ["model-a", "model-b"]);
  });

  test("/api/time uses the weighted-mean latency formula once latency_sum_s/latency_n exist", async () => {
    const rows = await getJson(mod, "/api/time?dimension=agent&project=proj-a");
    const coder = rows.find((r: any) => r.key === "coder");
    // SUM(latency_sum_s)/SUM(latency_n) = (100+400)/(10+20) = 16.667, which
    // differs from the naive AVG(avg_latency_s) of (10+20)/2 = 15 -- proves
    // the weighted formula is actually the one being used, not a fallback.
    expect(coder.avg_latency_s).toBeCloseTo(500 / 30, 10);
    expect(coder.avg_latency_s).not.toBeCloseTo(15, 5);
    expect(coder.tokens_p50).toBe(percentile([160, 320], 0.5));
  });

  test("/api/time honors subagent cohort filters", async () => {
    const rootRows = await getRows(mod, "/api/time?dimension=agent&project=proj-a&subagent=0");
    expectOnlyValues(rootRows, "key", ["primary"]);
    const primary = requireRow(rootRows, "key", "primary");
    expect(primary.sessions).toBe(1);
    expect(primary.tokens).toBe(1100);
    expect(primary.avg_latency_s).toBe(1);

    const subagentRows = await getRows(mod, "/api/time?dimension=agent&project=proj-a&subagent=1");
    expectOnlyValues(subagentRows, "key", ["coder", "reviewer"]);
  });

  test("analytics endpoints keep unsupported subagent values unfiltered", async () => {
    const endpoints = [
      { path: "/api/efficiency?dimension=agent&project=proj-a", field: "key" },
      { path: "/api/efficiency/quality?dimension=agent&project=proj-a", field: "key" },
      { path: "/api/efficiency/frontier?project=proj-a", field: "model" },
      { path: "/api/time?dimension=agent&project=proj-a", field: "key" },
    ];

    for (const endpoint of endpoints) {
      const baseline = await getRows(mod, endpoint.path);
      const unsupported = await getRows(mod, `${endpoint.path}&subagent=2`);
      expect(valuesFor(unsupported, endpoint.field)).toEqual(valuesFor(baseline, endpoint.field));
    }
  });

  test("/api/data-quality passes through month/field/coverage/is_gap and ignores ?project", async () => {
    const rows = await getJson(mod, "/api/data-quality?project=proj-a");
    expect(rows).toEqual([
      { month: "2026-01", field: "summary_additions", coverage: 0.95, is_gap: 0 },
      { month: "2026-06", field: "summary_additions", coverage: 0.01, is_gap: 1 },
    ]);
  });

  test("/api/tools rolls up tool_metrics across months with err_rate + Wilson and honest duration basis", async () => {
    const rows = await getJson(mod, "/api/tools?project=proj-a");
    const bash = rows.find((r: any) => r.tool === "bash");
    expect(bash.calls).toBe(15);
    expect(bash.errors).toBe(1);
    expect(bash.err_rate).toBeCloseTo(1 / 15, 10);
    const w = wilson(1, 15);
    expect(bash.err_rate_lo).toBe(w.lo);
    expect(bash.err_rate_hi).toBe(w.hi);
    expect(bash.dur_p50_s).toBeNull();
    expect(bash.dur_p95_s).toBeNull();
    expect(bash.duration_quantile_basis).toBe("unavailable_monthly_rollups");
  });

  test("/api/tools/errors resolves a bare project slug (table has no slug column) and ranks by n desc", async () => {
    const rows = await getJson(mod, "/api/tools/errors?project=proj-a&tool=bash");
    expect(rows).toEqual([
      { error_class: "timeout", n: 3, sample: "Command timed out after 30s" },
      { error_class: "permission_denied", n: 1, sample: "Permission denied" },
    ]);
  });

  test("/api/orchestration/routing adds child_adds/child_patch_ok/roi from delegation's own columns", async () => {
    const rows = await getJson(mod, "/api/orchestration/routing?by=category&project=proj-a");
    const coding = rows.find((r: any) => r.key === "coding");
    expect(coding.child_adds).toBe(300); // 100 + 200
    expect(coding.child_patch_ok).toBe(5); // 2 + 3
    expect(coding.child_tokens).toBe(480); // s1 (160) + s2 (320)
    expect(coding.roi).toBeCloseTo((300 * 1000) / 480, 10);
  });

  test("/api/orchestration/hygiene lists delegation_instant_fail/delegation_zombie rows", async () => {
    const rows = await getJson(mod, "/api/orchestration/hygiene?project=proj-a");
    const statuses = rows.map((r: any) => r.title).sort();
    expect(statuses).toEqual(["d3-instant-fail", "d4-zombie"]);
    for (const r of rows) {
      expect(r).toHaveProperty("status");
      expect(r).toHaveProperty("duration_s");
      expect(r).toHaveProperty("requested_subagent_type");
      expect(r).toHaveProperty("title");
    }
  });
});

describe("legacy schema (pre-engine-migration cache): degrade, never throw", async () => {
  const mod = await loadServer("legacy", false);

  test("/api/time falls back to naive AVG(avg_latency_s) when latency_sum_s/latency_n are absent", async () => {
    const rows = await getJson(mod, "/api/time?dimension=agent&project=proj-a");
    const coder = rows.find((r: any) => r.key === "coder");
    expect(coder.avg_latency_s).toBeCloseTo(15, 10); // naive (10+20)/2, not the weighted 16.667
  });

  test("/api/data-quality, /api/tools, /api/tools/errors return [] instead of throwing", async () => {
    expect(await getJson(mod, "/api/data-quality")).toEqual([]);
    expect(await getJson(mod, "/api/tools?project=proj-a")).toEqual([]);
    expect(await getJson(mod, "/api/tools/errors?project=proj-a")).toEqual([]);
  });

  test("/api/orchestration/hygiene returns [] (no matching status/columns yet) instead of throwing", async () => {
    expect(await getJson(mod, "/api/orchestration/hygiene?project=proj-a")).toEqual([]);
  });

  test("/api/orchestration/routing derives child_adds/child_patch_ok via the session_metrics join fallback", async () => {
    const rows = await getJson(mod, "/api/orchestration/routing?by=category&project=proj-a");
    const coding = rows.find((r: any) => r.key === "coding");
    // no delegation.child_adds column -> falls back to SUM(m.summary_additions) for s1+s2
    expect(coding.child_adds).toBe(5);
    expect(coding.child_patch_ok).toBe(8);
    expect(coding.roi).toBeCloseTo((5 * 1000) / 480, 10);
  });

  test("previously-existing endpoints and fields are untouched", async () => {
    const meta = await getJson(mod, "/api/meta");
    expect(meta.projects).toBe(1);
    const eff = await getJson(mod, "/api/efficiency?dimension=model&project=proj-a");
    const modelA = eff.find((r: any) => r.key === "model-a");
    expect(modelA.tokens_per_session).toBeCloseTo(240, 10);
  });
});
