#!/usr/bin/env bun
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { tmpdir } from "node:os";
import { openSync, closeSync, fstatSync, readSync } from "node:fs";

import { Hono, type Context, type Next } from "hono";
import { assertDistinctDbPaths } from "./db-paths.ts";
import { parseBoundedInt } from "./http-query.ts";
import { redactText, redactValue } from "./redaction.ts";
import { createServerConfig, requiresAuth } from "./server-config.ts";
import { percentile, wilson } from "./stats.ts";

const CONFIG = createServerConfig();
const CACHE_DB = CONFIG.cachePath;
const SRC_DB = CONFIG.sourcePath;
const PORT = CONFIG.port;

assertDistinctDbPaths(SRC_DB, CACHE_DB);

const db = new Database(CACHE_DB, { readonly: true });
db.exec("PRAGMA query_only = 1;");

const src = new Database(SRC_DB, { readonly: true });
src.exec("PRAGMA query_only = 1;");

const app = new Hono();

app.use("/api/*", async (c: Context, next: Next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

function loopbackHostName(raw: string): string {
  const host = raw.trim().toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end >= 0 ? host.slice(1, end) : host;
  }
  const colonCount = host.split(":").length - 1;
  return colonCount === 1 ? host.slice(0, host.indexOf(":")) : host;
}

function isLoopbackHost(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const hostname = loopbackHostName(raw);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isLoopbackOrigin(raw: string | null | undefined): boolean {
  if (!raw) return true;
  try {
    return isLoopbackHost(new URL(raw).host);
  } catch (error) {
    if (error instanceof TypeError) return false;
    throw error;
  }
}

app.use("/api/*", async (c: Context, next: Next) => {
  if (!requiresAuth(CONFIG)) {
    const requestHost = c.req.header("Host") ?? new URL(c.req.url).host;
    if (!isLoopbackHost(requestHost)) {
      return c.json({ error: { code: "FORBIDDEN", message: "Loopback host required." } }, 403);
    }
    if (!isLoopbackOrigin(c.req.header("Origin"))) {
      return c.json({ error: { code: "FORBIDDEN", message: "Loopback origin required." } }, 403);
    }
  }
  return next();
});

app.use("/api/*", async (c: Context, next: Next) => {
  if (!requiresAuth(CONFIG)) return next();
  const expected = CONFIG.authToken;
  const actual = c.req.header("Authorization") ?? "";
  if (expected !== null && actual === `Bearer ${expected}`) return next();
  return c.json({ error: { code: "AUTH_REQUIRED", message: "Bearer token required." } }, 401);
});

const TOK = "(tokens_input+tokens_output+tokens_reasoning)";

app.get("/api/meta", (c) => {
  const row = db
    .query(
      `SELECT COUNT(*) projects, SUM(sessions) sessions, MAX(scanned_at) scanned_at FROM project`,
    )
    .get() as Record<string, unknown>;
  return c.json(row);
});

app.get("/api/global", (c) => {
  const g = db
    .query(
      `SELECT COUNT(*) sessions, SUM(is_subagent) subagents,
        SUM(${TOK}) tokens, SUM(active_min) active_min,
        SUM(tool_calls) tool_calls, SUM(tool_errors) tool_errors,
        SUM(apply_patch_ok) apply_patch_ok, SUM(apply_patch_err) apply_patch_err,
        SUM(compaction_count) compactions
       FROM session_metrics`,
    )
    .get() as Record<string, number>;
  return c.json({ ...g, flags: flagBreakdown() });
});

app.get("/api/projects", (c) => {
  const rows = db
    .query(
      `SELECT p.project_id, p.slug, p.sessions, p.tokens_total, p.scanned_at,
        (SELECT COUNT(*) FROM session_metrics s WHERE s.project_id=p.project_id AND s.flags<>'') AS flagged,
        (SELECT SUM(active_min) FROM session_metrics s WHERE s.project_id=p.project_id) AS active_min
       FROM project p ORDER BY p.tokens_total DESC`,
    )
    .all();
  return c.json(redactValue(rows));
});

app.get("/api/projects/:id", (c) => {
  const id = c.req.param("id");
  const o = db
    .query(
      `SELECT project_id, slug, COUNT(*) sessions, SUM(is_subagent) subagents,
        SUM(${TOK}) tokens, SUM(active_min) active_min,
        SUM(tool_calls) tool_calls, SUM(tool_errors) tool_errors,
        SUM(apply_patch_ok) apply_patch_ok, SUM(apply_patch_err) apply_patch_err,
        SUM(compaction_count) compactions, SUM(summary_additions) additions
       FROM session_metrics WHERE project_id = ? OR slug = ? GROUP BY project_id`,
    )
    .get(id, id) as Record<string, unknown> | null;
  if (!o) return c.json({ error: "project not found" }, 404);
  return c.json(redactValue({ ...o, flags: flagBreakdown(String(o.project_id)) }));
});

app.get("/api/projects/:id/sessions", (c) => {
  const id = c.req.param("id");
  const flaggedOnly = c.req.query("flagged") === "1";
  const limit = parseBoundedInt(c.req.query("limit"), { fallback: 50, min: 1, max: 500 });
  const order = c.req.query("order") === "active" ? "active_min" : TOK;
  const rows = db
    .query(
      `SELECT session_id, title, is_subagent, agent, model, time_created,
        ${TOK} tokens, tokens_reasoning, tool_calls, tool_errors, tool_error_rate,
        patch_count, apply_patch_ok, apply_patch_err, compaction_count,
        summary_additions, active_min, bursts, max_gap_h, avg_latency_s, flags
       FROM session_metrics
       WHERE (project_id = ? OR slug = ?) ${flaggedOnly ? "AND flags <> ''" : ""}
       ORDER BY ${order} DESC LIMIT ?`,
    )
    .all(id, id, limit);
  return c.json(redactValue(rows));
});

const CONSUMPTION_DIM_COL: Record<string, string> = {
  model: "model_id",
  agent: "agent",
  project: "slug",
  variant: "variant",
};

function consumptionFilters(c: Context) {
  const project = c.req.query("project");
  const subagent = c.req.query("subagent");
  const clauses: string[] = [];
  const params: SQLQueryBindings[] = [];
  if (project) {
    clauses.push("(project_id = ? OR slug = ?)");
    params.push(project, project);
  }
  if (subagent === "1" || subagent === "0") {
    clauses.push("is_subagent = ?");
    params.push(Number(subagent));
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

app.get("/api/consumption", (c) => {
  const dimension = c.req.query("dimension") ?? "model";
  const col = CONSUMPTION_DIM_COL[dimension] ?? CONSUMPTION_DIM_COL.model;
  const { where, params } = consumptionFilters(c);
  const rows = db
    .query(
      `SELECT ${col} AS key,
        COUNT(DISTINCT session_id) AS sessions,
        SUM(msgs) AS msgs,
        SUM(tokens_input) AS tokens_input,
        SUM(tokens_output) AS tokens_output,
        SUM(tokens_reasoning) AS tokens_reasoning,
        SUM(tokens_cache_read) AS tokens_cache_read,
        SUM(tokens_cache_write) AS tokens_cache_write,
        SUM(tokens_input+tokens_output+tokens_reasoning) AS total
       FROM session_model
       ${where}
       GROUP BY ${col}
       ORDER BY total DESC`,
    )
    .all(...params);
  return c.json(rows);
});

app.get("/api/consumption/timeline", (c) => {
  const { where, params } = consumptionFilters(c);
  const rows = db
    .query(
      `SELECT month,
        SUM(tokens_input) AS tokens_input,
        SUM(tokens_output) AS tokens_output,
        SUM(tokens_reasoning) AS tokens_reasoning,
        SUM(tokens_cache_read) AS tokens_cache_read,
        SUM(tokens_cache_write) AS tokens_cache_write,
        SUM(tokens_input+tokens_output+tokens_reasoning) AS total
       FROM session_model
       ${where}
       GROUP BY month
       ORDER BY month ASC`,
    )
    .all(...params);
  return c.json(rows);
});

app.get("/api/consumption/summary", (c) => {
  const { where, params } = consumptionFilters(c);
  const row = db
    .query(
      `SELECT
        SUM(tokens_input) AS tokens_input,
        SUM(tokens_output) AS tokens_output,
        SUM(tokens_reasoning) AS tokens_reasoning,
        SUM(tokens_cache_read) AS tokens_cache_read,
        SUM(tokens_cache_write) AS tokens_cache_write,
        SUM(tokens_input+tokens_output+tokens_reasoning) AS total,
        SUM(msgs) AS msgs,
        COUNT(DISTINCT session_id) AS sessions,
        COUNT(DISTINCT model_id) AS models,
        COUNT(DISTINCT agent) AS agents
       FROM session_model
       ${where}`,
    )
    .get(...params) as Record<string, number>;
  return c.json(row);
});

// ---------- helpers (safe division; never NaN/Infinity in JSON) ----------
export function ratio(num: unknown, den: unknown): number | null {
  const n = Number(num ?? 0);
  const d = Number(den ?? 0);
  return d > 0 ? n / d : null;
}

// ---------- schema introspection (defensive against not-yet-migrated cache) ----------
// Re-checked per call (cheap PRAGMA, no caching) so a hot scan rebuild by the
// engine module is picked up without a server restart.

export function tableColumns(handle: Database, table: string): Set<string> {
  const cols = new Set<string>();
  const rows = handle.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  for (const r of rows) cols.add(r.name);
  return cols;
}

export function tableExists(handle: Database, table: string): boolean {
  return tableColumns(handle, table).size > 0;
}

// ---------- percentiles over scoped rows (stats.percentile) ----------

export function sortedNums(values: Array<number | string | null | undefined>): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  out.sort((a, b) => a - b);
  return out;
}

// percentile() returns NaN on empty input; normalize that to null for JSON.
export function pct(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const v = percentile(sorted, q);
  return Number.isFinite(v) ? v : null;
}

export function groupSorted(rows: Array<{ key: unknown; value: unknown }>): Map<string, number[]> {
  const buckets = new Map<string, Array<number | string | null | undefined>>();
  for (const r of rows) {
    const k = String(r.key);
    const v = r.value as number | string | null | undefined;
    const arr = buckets.get(k);
    if (arr) arr.push(v);
    else buckets.set(k, [v]);
  }
  const out = new Map<string, number[]>();
  for (const [k, arr] of buckets) out.set(k, sortedNums(arr));
  return out;
}

// ---------- Wilson interval (stats.wilson) ----------
// null (not wilson()'s own [0,1] default) when n<=0, matching ratio()'s
// null-on-zero-denominator convention.
export function wilsonOrNull(succ: number, n: number): { lo: number | null; hi: number | null } {
  if (!(n > 0)) return { lo: null, hi: null };
  const w = wilson(succ, n);
  return { lo: w.lo, hi: w.hi };
}

// ---------- project scoping for tables whose column set is uncertain ----------

// Some cache tables (e.g. tool_error_class) only carry project_id, not slug.
// `?project=` may be either, so resolve a bare slug to its project_id via the
// `project` table before filtering a project_id-only table.
export function resolveProjectId(project: string): string {
  const row = db.query(`SELECT project_id FROM project WHERE project_id = ? OR slug = ? LIMIT 1`).get(
    project,
    project,
  ) as { project_id: string } | null;
  return row?.project_id ?? project;
}

export function scopedProjectClause(
  cols: Set<string>,
  project: string | undefined,
): { clause: string | null; values: SQLQueryBindings[] } {
  if (!project) return { clause: null, values: [] };
  const hasPid = cols.has("project_id");
  const hasSlug = cols.has("slug");
  if (hasPid && hasSlug) return { clause: "(project_id = ? OR slug = ?)", values: [project, project] };
  if (hasPid) return { clause: "project_id = ?", values: [resolveProjectId(project)] };
  if (hasSlug) return { clause: "slug = ?", values: [project] };
  return { clause: null, values: [] };
}

export function scopedWhere(
  clauses: Array<{ clause: string | null; values: SQLQueryBindings[] }>,
): { where: string; params: SQLQueryBindings[] } {
  const active = clauses.filter((x): x is { clause: string; values: SQLQueryBindings[] } => x.clause !== null);
  if (active.length === 0) return { where: "", params: [] };
  return { where: `WHERE ${active.map((x) => x.clause).join(" AND ")}`, params: active.flatMap((x) => x.values) };
}

const EFFICIENCY_DIM_COL: Record<string, string> = {
  model: "model_id",
  agent: "agent",
};

// dimension column for session_metrics-backed endpoints (quality/frontier):
// "model" uses the dominant model attributed to the session (§5 of spec).
const QUALITY_DIM_COL: Record<string, string> = {
  model: "dominant_model_id",
  agent: "agent",
};

function metricsFilters(c: Context) {
  const project = c.req.query("project");
  const subagent = c.req.query("subagent");
  const clauses: string[] = [];
  const params: SQLQueryBindings[] = [];
  if (project) {
    clauses.push("(project_id = ? OR slug = ?)");
    params.push(project, project);
  }
  if (subagent === "1" || subagent === "0") {
    clauses.push("is_subagent = ?");
    params.push(Number(subagent));
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

app.get("/api/efficiency", (c) => {
  const dimension = c.req.query("dimension") === "agent" ? "agent" : "model";
  const col = EFFICIENCY_DIM_COL[dimension];
  const { where, params } = consumptionFilters(c);
  const dimClause = col === "model_id" ? "model_id IS NOT NULL" : "1=1";
  const combinedWhere = where
    ? `${where} AND ${dimClause}`
    : `WHERE ${dimClause}`;
  const rows = db
    .query(
      `SELECT ${col} AS key,
        COUNT(DISTINCT session_id) AS sessions,
        SUM(msgs) AS msgs,
        SUM(tokens_input) AS tokens_input,
        SUM(tokens_output) AS tokens_output,
        SUM(tokens_reasoning) AS tokens_reasoning,
        SUM(tokens_cache_read) AS tokens_cache_read,
        SUM(tokens_cache_write) AS tokens_cache_write,
        SUM(tokens_input+tokens_output+tokens_reasoning) AS total_tokens
       FROM session_model
       ${combinedWhere}
       GROUP BY ${col}
       ORDER BY total_tokens DESC`,
    )
    .all(...params) as Array<Record<string, number | string>>;

  // Row-grain tokens for tokens_p50/p90 (same grain as total_tokens above).
  const rawRows = db
    .query(
      `SELECT ${col} AS key, session_id, (tokens_input+tokens_output+tokens_reasoning) AS tok
       FROM session_model
       ${combinedWhere}`,
    )
    .all(...params) as Array<{ key: string; session_id: string; tok: number }>;
  const tokensByKey = groupSorted(rawRows.map((r) => ({ key: r.key, value: r.tok })));

  // Latency lives on session_metrics (one row per session, not per
  // session+model+variant), so dedupe session_id per key before sampling it.
  const sidsByKey = new Map<string, Set<string>>();
  for (const r of rawRows) {
    const set = sidsByKey.get(r.key) ?? new Set<string>();
    set.add(r.session_id);
    sidsByKey.set(r.key, set);
  }
  const latFilter = consumptionFilters(c);
  const latRows = db
    .query(`SELECT session_id, avg_latency_s FROM session_metrics ${latFilter.where}`)
    .all(...latFilter.params) as Array<{ session_id: string; avg_latency_s: number | null }>;
  const latBySid = new Map(latRows.map((r) => [r.session_id, r.avg_latency_s]));
  const latencyByKey = new Map<string, number[]>();
  for (const [k, sids] of sidsByKey) {
    latencyByKey.set(k, sortedNums([...sids].map((sid) => latBySid.get(sid))));
  }

  const out = rows.map((r) => {
    const sessions = Number(r.sessions ?? 0);
    const msgs = Number(r.msgs ?? 0);
    const totalTokens = Number(r.total_tokens ?? 0);
    const output = Number(r.tokens_output ?? 0);
    const input = Number(r.tokens_input ?? 0);
    const reasoning = Number(r.tokens_reasoning ?? 0);
    const cacheRead = Number(r.tokens_cache_read ?? 0);
    const key = String(r.key);
    return {
      ...r,
      total_tokens: totalTokens,
      tokens_per_session: ratio(totalTokens, sessions),
      tokens_per_msg: ratio(totalTokens, msgs),
      reasoning_ratio: ratio(reasoning, output),
      cache_reuse_rate: ratio(cacheRead, input + cacheRead),
      output_input_ratio: ratio(output, input),
      tokens_p50: pct(tokensByKey.get(key) ?? [], 0.5),
      tokens_p90: pct(tokensByKey.get(key) ?? [], 0.9),
      latency_p50: pct(latencyByKey.get(key) ?? [], 0.5),
      latency_p95: pct(latencyByKey.get(key) ?? [], 0.95),
    };
  });
  return c.json(out);
});

app.get("/api/efficiency/quality", (c) => {
  const dimension = c.req.query("dimension") === "agent" ? "agent" : "model";
  const col = QUALITY_DIM_COL[dimension];
  const { where, params } = metricsFilters(c);
  const dimClause = `${col} IS NOT NULL AND ${col} <> ''`;
  const combinedWhere = where ? `${where} AND ${dimClause}` : `WHERE ${dimClause}`;
  const rows = db
    .query(
      `SELECT ${col} AS key,
        COUNT(*) AS sessions,
        AVG(${TOK}) AS tokens_per_session,
        SUM(tool_calls) AS tool_calls,
        SUM(tool_errors) AS tool_errors,
        SUM(apply_patch_ok) AS apply_patch_ok,
        SUM(apply_patch_err) AS apply_patch_err,
        SUM(CASE WHEN (summary_additions+summary_deletions) > 0 THEN ${TOK} ELSE 0 END) AS diff_tokens,
        SUM(CASE WHEN (summary_additions+summary_deletions) > 0 THEN summary_additions+summary_deletions ELSE 0 END) AS diff_lines,
        SUM(CASE WHEN (summary_additions+summary_deletions) > 0 THEN 1 ELSE 0 END) AS diff_sessions,
        SUM(active_min) AS active_min_total
       FROM session_metrics
       ${combinedWhere}
       GROUP BY ${col}
       ORDER BY sessions DESC`,
    )
    .all(...params) as Array<Record<string, number | string>>;

  const rawRows = db
    .query(`SELECT ${col} AS key, (${TOK}) AS tok, avg_latency_s AS lat FROM session_metrics ${combinedWhere}`)
    .all(...params) as Array<{ key: string; tok: number; lat: number | null }>;
  const tokensByKey = groupSorted(rawRows.map((r) => ({ key: r.key, value: r.tok })));
  const latencyByKey = groupSorted(rawRows.map((r) => ({ key: r.key, value: r.lat })));

  const out = rows.map((r) => {
    const sessions = Number(r.sessions ?? 0);
    const toolCalls = Number(r.tool_calls ?? 0);
    const toolErrors = Number(r.tool_errors ?? 0);
    const apOk = Number(r.apply_patch_ok ?? 0);
    const apErr = Number(r.apply_patch_err ?? 0);
    const diffTokens = Number(r.diff_tokens ?? 0);
    const diffLines = Number(r.diff_lines ?? 0);
    const key = String(r.key);
    const errW = wilsonOrNull(toolErrors, toolCalls);
    const precW = wilsonOrNull(apOk, apOk + apErr);
    return {
      key: r.key,
      sessions,
      tokens_per_session: r.tokens_per_session,
      tool_error_rate: ratio(toolErrors, toolCalls),
      tool_error_rate_lo: errW.lo,
      tool_error_rate_hi: errW.hi,
      apply_patch_precision: ratio(apOk, apOk + apErr),
      apply_patch_precision_lo: precW.lo,
      apply_patch_precision_hi: precW.hi,
      rank_lo: precW.lo,
      tokens_per_diff_line: ratio(diffTokens, diffLines),
      diff_sessions: Number(r.diff_sessions ?? 0),
      active_min_avg: ratio(r.active_min_total, sessions),
      tokens_p50: pct(tokensByKey.get(key) ?? [], 0.5),
      tokens_p90: pct(tokensByKey.get(key) ?? [], 0.9),
      latency_p50: pct(latencyByKey.get(key) ?? [], 0.5),
      latency_p95: pct(latencyByKey.get(key) ?? [], 0.95),
    };
  });
  return c.json(out);
});

app.get("/api/efficiency/matrix", (c) => {
  const { where, params } = consumptionFilters(c);
  const dimClause = "model_id IS NOT NULL";
  const combinedWhere = where ? `${where} AND ${dimClause}` : `WHERE ${dimClause}`;
  const rows = db
    .query(
      `SELECT model_id, agent,
        COUNT(DISTINCT session_id) AS sessions,
        SUM(msgs) AS msgs,
        SUM(tokens_input) AS tokens_input,
        SUM(tokens_output) AS tokens_output,
        SUM(tokens_reasoning) AS tokens_reasoning,
        SUM(tokens_cache_read) AS tokens_cache_read,
        SUM(tokens_input+tokens_output+tokens_reasoning) AS total_tokens
       FROM session_model
       ${combinedWhere}
       GROUP BY model_id, agent
       ORDER BY total_tokens DESC`,
    )
    .all(...params) as Array<Record<string, number | string>>;

  const out = rows.map((r) => {
    const sessions = Number(r.sessions ?? 0);
    const totalTokens = Number(r.total_tokens ?? 0);
    const output = Number(r.tokens_output ?? 0);
    const input = Number(r.tokens_input ?? 0);
    const reasoning = Number(r.tokens_reasoning ?? 0);
    const cacheRead = Number(r.tokens_cache_read ?? 0);
    return {
      model_id: r.model_id,
      agent: r.agent,
      sessions,
      msgs: Number(r.msgs ?? 0),
      total_tokens: totalTokens,
      tokens_per_session: ratio(totalTokens, sessions),
      reasoning_ratio: ratio(reasoning, output),
      cache_reuse_rate: ratio(cacheRead, input + cacheRead),
    };
  });
  return c.json(out);
});

app.get("/api/efficiency/frontier", (c) => {
  const { where, params } = metricsFilters(c);
  const dimClause = "dominant_model_id IS NOT NULL AND dominant_model_id <> ''";
  const combinedWhere = where ? `${where} AND ${dimClause}` : `WHERE ${dimClause}`;
  const rows = db
    .query(
      `SELECT dominant_model_id AS model,
        COUNT(*) AS sessions,
        AVG(${TOK}) AS tokens_per_session,
        SUM(tool_calls) AS tool_calls,
        SUM(tool_errors) AS tool_errors,
        SUM(apply_patch_ok) AS apply_patch_ok,
        SUM(apply_patch_err) AS apply_patch_err
       FROM session_metrics
       ${combinedWhere}
       GROUP BY dominant_model_id
       ORDER BY sessions DESC`,
    )
    .all(...params) as Array<Record<string, number | string>>;

  const out = rows.map((r) => {
    const toolCalls = Number(r.tool_calls ?? 0);
    const toolErrors = Number(r.tool_errors ?? 0);
    const apOk = Number(r.apply_patch_ok ?? 0);
    const apErr = Number(r.apply_patch_err ?? 0);
    const errW = wilsonOrNull(toolErrors, toolCalls);
    const precW = wilsonOrNull(apOk, apOk + apErr);
    return {
      model: r.model,
      sessions: Number(r.sessions ?? 0),
      tokens_per_session: r.tokens_per_session,
      tool_error_rate: ratio(toolErrors, toolCalls),
      tool_error_rate_lo: errW.lo,
      tool_error_rate_hi: errW.hi,
      apply_patch_precision: ratio(apOk, apOk + apErr),
      apply_patch_precision_lo: precW.lo,
      apply_patch_precision_hi: precW.hi,
      rank_lo: precW.lo,
    };
  });
  return c.json(out);
});

const ORCH_ROUTING_DIM_COL: Record<string, string> = {
  category: "category",
  subagent_type: "requested_subagent_type",
  model: "model",
};

const TIME_DIM_COL: Record<string, string> = {
  agent: "agent",
  model: "dominant_model_id",
  project: "slug",
};

const MAX_TREE_DEPTH = 20;

function projectFilter(c: Context, col = "project_id", slugCol = "slug") {
  const project = c.req.query("project");
  if (!project) return { where: "", params: [] as SQLQueryBindings[] };
  return { where: `WHERE (${col} = ? OR ${slugCol} = ?)`, params: [project, project] };
}

app.get("/api/orchestration/summary", (c) => {
  const { where, params } = projectFilter(c);
  const counts = db
    .query(
      `SELECT
        SUM(CASE WHEN spawn_depth = 0 THEN 1 ELSE 0 END) AS primary_count,
        SUM(CASE WHEN spawn_depth > 0 THEN 1 ELSE 0 END) AS subagent_count
       FROM session_metrics ${where}`,
    )
    .get(...params) as Record<string, number>;
  const byDepth = db
    .query(
      `SELECT spawn_depth, COUNT(*) AS sessions, SUM(${TOK}) AS tokens, SUM(active_min) AS active_min
       FROM session_metrics ${where}
       GROUP BY spawn_depth ORDER BY spawn_depth ASC`,
    )
    .all(...params);
  const delWhere = projectFilter(c);
  const totalDelegations = (
    db.query(`SELECT COUNT(*) AS n FROM delegation ${delWhere.where}`).get(...delWhere.params) as Record<
      string,
      number
    >
  ).n;
  const byCategory = db
    .query(
      `SELECT COALESCE(category,'(sem categoria)') AS category, COUNT(*) AS count
       FROM delegation ${delWhere.where}
       GROUP BY category ORDER BY count DESC`,
    )
    .all(...delWhere.params);
  return c.json(redactValue({
    primary_count: Number(counts.primary_count ?? 0),
    subagent_count: Number(counts.subagent_count ?? 0),
    by_spawn_depth: byDepth,
    total_delegations: totalDelegations,
    by_category: byCategory,
  }));
});

app.get("/api/orchestration/routing", (c) => {
  const by = c.req.query("by") ?? "category";
  const col = ORCH_ROUTING_DIM_COL[by] ?? ORCH_ROUTING_DIM_COL.category;
  const { where, params } = projectFilter(c, "d.project_id", "d.slug");
  // Prefer denormalized delegation.child_adds/child_patch_ok once the engine
  // module lands them; until then, derive the same numbers from the child's
  // session_metrics row via the join already used for child_tokens.
  const delegationCols = tableColumns(db, "delegation");
  const childAddsExpr = delegationCols.has("child_adds") ? "SUM(d.child_adds)" : "SUM(m.summary_additions)";
  const childPatchOkExpr = delegationCols.has("child_patch_ok")
    ? "SUM(d.child_patch_ok)"
    : "SUM(m.apply_patch_ok)";
  const rows = db
    .query(
      `SELECT d.${col} AS key,
        COUNT(*) AS count,
        SUM(m.tokens_input+m.tokens_output+m.tokens_reasoning) AS child_tokens,
        AVG(d.duration_s) AS avg_duration_s,
        SUM(COALESCE(d.run_in_background,0)) AS run_in_background_count,
        ${childAddsExpr} AS child_adds,
        ${childPatchOkExpr} AS child_patch_ok
       FROM delegation d
       LEFT JOIN session_metrics m ON m.session_id = d.child_session_id
       ${where}
       GROUP BY d.${col}
       ORDER BY count DESC`,
    )
    .all(...params) as Array<Record<string, number | string | null>>;
  const out = rows.map((r) => ({
    ...r,
    roi: ratio(Number(r.child_adds ?? 0) * 1000, Number(r.child_tokens ?? 0)),
  }));
  return c.json(redactValue(out));
});

app.get("/api/orchestration/hygiene", (c) => {
  const { where, params } = projectFilter(c);
  // delegation_instant_fail / delegation_zombie are the engine module's
  // boolean (0/1) flag columns; fall back to status enum values or plain
  // "no data yet" if an older/renamed cache is in place.
  const delegationCols = tableColumns(db, "delegation");
  let hygieneClause: string;
  if (delegationCols.has("delegation_instant_fail") || delegationCols.has("delegation_zombie")) {
    const parts: string[] = [];
    if (delegationCols.has("delegation_instant_fail")) parts.push("delegation_instant_fail = 1");
    if (delegationCols.has("delegation_zombie")) parts.push("delegation_zombie = 1");
    hygieneClause = `(${parts.join(" OR ")})`;
  } else {
    hygieneClause = "status IN ('delegation_instant_fail','delegation_zombie','instant_fail','zombie')";
  }
  const combinedWhere = where ? `${where} AND ${hygieneClause}` : `WHERE ${hygieneClause}`;
  const rows = db
    .query(
      `SELECT parent_session_id, child_session_id, status, duration_s, requested_subagent_type, title
       FROM delegation
       ${combinedWhere}
       ORDER BY duration_s DESC`,
    )
    .all(...params);
  return c.json(redactValue(rows));
});

app.get("/api/orchestration/top", (c) => {
  const { where, params } = projectFilter(c);
  const limit = parseBoundedInt(c.req.query("limit"), { fallback: 20, min: 1, max: 200 });
  const rows = db
    .query(
      `WITH RECURSIVE tree(root_id, session_id, depth) AS (
         SELECT session_id, session_id, 0 FROM session_metrics
         ${where ? where + " AND spawn_depth = 0" : "WHERE spawn_depth = 0"}
         UNION ALL
         SELECT t.root_id, sm.session_id, t.depth + 1
         FROM session_metrics sm JOIN tree t ON sm.parent_id = t.session_id
         WHERE t.depth < ${MAX_TREE_DEPTH}
       )
       SELECT r.session_id, r.title, r.agent, r.dominant_model_id,
         COUNT(*) - 1 AS descendants,
         SUM(m.tokens_input+m.tokens_output+m.tokens_reasoning) AS tokens_subtree,
         SUM(m.active_min) AS active_min_subtree
       FROM tree
       JOIN session_metrics m ON m.session_id = tree.session_id
       JOIN session_metrics r ON r.session_id = tree.root_id
       GROUP BY tree.root_id
       ORDER BY descendants DESC, tokens_subtree DESC
       LIMIT ?`,
    )
    .all(...params, limit);
  return c.json(redactValue(rows));
});

app.get("/api/orchestration/tree", (c) => {
  const session = c.req.query("session");
  if (!session) return c.json({ error: "missing ?session=" }, 400);
  const rows = db
    .query(
      `WITH RECURSIVE desc_tree(session_id, depth) AS (
         SELECT session_id, 0 FROM session_metrics WHERE session_id = ?
         UNION ALL
         SELECT sm.session_id, d.depth + 1
         FROM session_metrics sm JOIN desc_tree d ON sm.parent_id = d.session_id
         WHERE d.depth < ${MAX_TREE_DEPTH}
       )
       SELECT sm.session_id, sm.title, sm.agent, sm.dominant_model_id,
         ${TOK} AS tokens, sm.active_min, sm.spawn_depth, sm.parent_id, d.depth
       FROM desc_tree d JOIN session_metrics sm ON sm.session_id = d.session_id
       ORDER BY d.depth ASC`,
    )
    .all(session);
  return c.json(redactValue(rows));
});

app.get("/api/time", (c) => {
  const dimension = c.req.query("dimension") ?? "agent";
  const col = TIME_DIM_COL[dimension] ?? TIME_DIM_COL.agent;
  const { where, params } = metricsFilters(c);
  const dimClause = `${col} IS NOT NULL AND ${col} <> ''`;
  const combinedWhere = where ? `${where} AND ${dimClause}` : `WHERE ${dimClause}`;
  // Weighted mean once latency_sum_s/latency_n exist: naive AVG(avg_latency_s)
  // over-weights low-message sessions equally with high-message ones.
  const smCols = tableColumns(db, "session_metrics");
  const hasWeightedLatency = smCols.has("latency_sum_s") && smCols.has("latency_n");
  const latencyAggExpr = hasWeightedLatency
    ? "SUM(latency_sum_s)/NULLIF(SUM(latency_n),0)"
    : "AVG(avg_latency_s)";
  const rows = db
    .query(
      `SELECT ${col} AS key,
        COUNT(*) AS sessions,
        SUM(active_min) AS active_min,
        ${latencyAggExpr} AS avg_latency_s,
        SUM(${TOK}) AS tokens
       FROM session_metrics
       ${combinedWhere}
       GROUP BY ${col}
       ORDER BY tokens DESC`,
    )
    .all(...params) as Array<Record<string, number | string>>;

  const rawRows = db
    .query(`SELECT ${col} AS key, (${TOK}) AS tok, avg_latency_s AS lat FROM session_metrics ${combinedWhere}`)
    .all(...params) as Array<{ key: string; tok: number; lat: number | null }>;
  const tokensByKey = groupSorted(rawRows.map((r) => ({ key: r.key, value: r.tok })));
  const latencyByKey = groupSorted(rawRows.map((r) => ({ key: r.key, value: r.lat })));

  const out = rows.map((r) => {
    const key = String(r.key);
    return {
      ...r,
      tokens_per_active_min: ratio(r.tokens, r.active_min),
      tokens_p50: pct(tokensByKey.get(key) ?? [], 0.5),
      tokens_p90: pct(tokensByKey.get(key) ?? [], 0.9),
      latency_p50: pct(latencyByKey.get(key) ?? [], 0.5),
      latency_p95: pct(latencyByKey.get(key) ?? [], 0.95),
    };
  });
  return c.json(out);
});

// ---------- data quality (Phase 2) ----------
// `?project` is intentionally never read here: data_quality is a global,
// month x field coverage table, not per-project.

app.get("/api/data-quality", (c) => {
  if (!tableExists(db, "data_quality")) return c.json([]);
  const rows = db
    .query(`SELECT month, field, coverage, is_gap FROM data_quality ORDER BY field ASC, month ASC`)
    .all();
  return c.json(rows);
});

// ---------- tool rollups (Phase 3) ----------
// tool_metrics / tool_error_class are populated by the engine module's scan
// and their exact column set may still be in flux; adapt to whichever of
// raw-per-call columns or pre-aggregated columns are actually present.

app.get("/api/tools", (c) => {
  if (!tableExists(db, "tool_metrics")) return c.json([]);
  const cols = tableColumns(db, "tool_metrics");
  if (!cols.has("tool")) return c.json([]);
  const project = c.req.query("project");
  const { where, params } = scopedWhere([scopedProjectClause(cols, project)]);

  const hasPrecomputedCounts = cols.has("calls") && cols.has("errors");
  const hasStatus = cols.has("status");
  const hasRawDuration = cols.has("duration_s");
  const hasPrecomputedDur = cols.has("dur_p50_s") && cols.has("dur_p95_s");
  const hasDurationSamples = tableExists(db, "tool_duration_sample");

  const callsExpr = hasPrecomputedCounts ? "SUM(calls)" : "COUNT(*)";
  const errorsExpr = hasPrecomputedCounts
    ? "SUM(errors)"
    : hasStatus
      ? "SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)"
      : "0";

  const rows = db
    .query(
      `SELECT tool, ${callsExpr} AS calls, ${errorsExpr} AS errors
       FROM tool_metrics
       ${where}
       GROUP BY tool
       ORDER BY calls DESC`,
    )
    .all(...params) as Array<{ tool: string; calls: number; errors: number }>;

  const durByTool = hasRawDuration
    ? groupSorted(
        (
          db.query(`SELECT tool, duration_s AS d FROM tool_metrics ${where}`).all(...params) as Array<{
            tool: string;
            d: number | null;
          }>
        ).map((r) => ({ key: r.tool, value: r.d })),
      )
    : hasDurationSamples
      ? groupSorted(
          (
            db.query(`SELECT tool, duration_s AS d FROM tool_duration_sample ${where}`).all(...params) as Array<{
              tool: string;
              d: number | null;
            }>
          ).map((r) => ({ key: r.tool, value: r.d })),
        )
    : new Map<string, number[]>();
  const precomputedDur = hasPrecomputedDur
    ? (db.query(`SELECT tool, dur_p50_s AS p50, dur_p95_s AS p95 FROM tool_metrics ${where}`).all(
        ...params,
      ) as Array<{ tool: string; p50: number | null; p95: number | null }>)
    : [];
  const precomputedByTool = new Map<string, { p50: number[]; p95: number[] }>();
  for (const r of precomputedDur) {
    const bucket = precomputedByTool.get(r.tool) ?? { p50: [], p95: [] };
    if (r.p50 !== null && Number.isFinite(Number(r.p50))) bucket.p50.push(Number(r.p50));
    if (r.p95 !== null && Number.isFinite(Number(r.p95))) bucket.p95.push(Number(r.p95));
    precomputedByTool.set(r.tool, bucket);
  }
  const out = rows.map((r) => {
    const calls = Number(r.calls ?? 0);
    const errors = Number(r.errors ?? 0);
    const w = wilsonOrNull(errors, calls);
    const durationBasis = hasRawDuration || hasDurationSamples ? "raw_samples" : hasPrecomputedDur ? "unavailable_monthly_rollups" : "unavailable";
    return {
      tool: r.tool,
      calls,
      errors,
      err_rate: ratio(errors, calls),
      err_rate_lo: w.lo,
      err_rate_hi: w.hi,
      dur_p50_s: hasRawDuration || hasDurationSamples ? pct(durByTool.get(r.tool) ?? [], 0.5) : null,
      dur_p95_s: hasRawDuration || hasDurationSamples ? pct(durByTool.get(r.tool) ?? [], 0.95) : null,
      duration_quantile_basis: durationBasis,
    };
  });
  return c.json(out);
});

app.get("/api/tools/errors", (c) => {
  if (!tableExists(db, "tool_error_class")) return c.json([]);
  const cols = tableColumns(db, "tool_error_class");
  if (!cols.has("error_class")) return c.json([]);
  const project = c.req.query("project");
  const tool = c.req.query("tool");
  const toolClause: { clause: string | null; values: SQLQueryBindings[] } =
    tool && cols.has("tool") ? { clause: "tool = ?", values: [tool] } : { clause: null, values: [] };
  const { where, params } = scopedWhere([scopedProjectClause(cols, project), toolClause]);
  const limit = parseBoundedInt(c.req.query("limit"), { fallback: 20, min: 1, max: 100 });
  const nExpr = cols.has("n") ? "SUM(n)" : "COUNT(*)";

  const rows = db
    .query(
      `SELECT error_class, ${nExpr} AS n
       FROM tool_error_class
       ${where}
       GROUP BY error_class
       ORDER BY n DESC
       LIMIT ?`,
    )
    .all(...params, limit) as Array<{ error_class: string; n: number }>;

  const sampleByClass = new Map<string, string>();
  if (cols.has("sample")) {
    const sampleRows = db
      .query(`SELECT error_class, sample FROM tool_error_class ${where} GROUP BY error_class`)
      .all(...params) as Array<{ error_class: string; sample: string | null }>;
    for (const r of sampleRows) if (r.sample) sampleByClass.set(r.error_class, r.sample);
  }

  const out = rows.map((r) => ({
    error_class: r.error_class,
    n: Number(r.n ?? 0),
    sample: sampleByClass.get(r.error_class) ? redactText(String(sampleByClass.get(r.error_class))) : null,
  }));
  return c.json(out);
});

function flagBreakdown(projectId?: string): Record<string, number> {
  const where = projectId ? "WHERE project_id = ? AND flags <> ''" : "WHERE flags <> ''";
  const rows = (projectId
    ? db.query(`SELECT flags FROM session_metrics ${where}`).all(projectId)
    : db.query(`SELECT flags FROM session_metrics ${where}`).all()) as Array<{ flags: string }>;
  const out: Record<string, number> = {};
  for (const r of rows)
    for (const f of r.flags.split(",")) if (f) out[f] = (out[f] ?? 0) + 1;
  return out;
}

// Falls back to a live-computed session row when the batch-scanned cache
// (`session_metrics`, populated by `scan.ts --all`) has no row yet -- which
// is the common case for anything the Live tab surfaces, since that tab
// reads `src` directly and the cache can be hours or days stale. Analytics
// that only the scan computes (flags, active_min, patch precision, ...)
// come back null/zero here; `live_fallback: true` tells the UI why.
function buildLiveSessionFallback(id: string): Record<string, unknown> | null {
  const row = src
    .query(
      `SELECT s.id, s.project_id, s.parent_id, s.title, s.agent, s.model, s.time_created, s.time_updated,
              s.tokens_input, s.tokens_output, s.tokens_reasoning, s.tokens_cache_read, s.tokens_cache_write, s.cost,
              s.summary_additions, s.summary_deletions, s.summary_files, p.worktree
       FROM session s LEFT JOIN project p ON p.id = s.project_id
       WHERE s.id = ?`,
    )
    .get(id) as
    | {
        id: string;
        project_id: string;
        parent_id: string | null;
        title: string | null;
        agent: string | null;
        model: string | null;
        time_created: number;
        time_updated: number;
        tokens_input: number;
        tokens_output: number;
        tokens_reasoning: number;
        tokens_cache_read: number;
        tokens_cache_write: number;
        cost: number | null;
        summary_additions: number;
        summary_deletions: number;
        summary_files: number;
        worktree: string | null;
      }
    | null;
  if (!row) return null;

  let modelInfo: { id?: string; providerID?: string; variant?: string } = {};
  try {
    modelInfo = row.model ? JSON.parse(row.model) : {};
  } catch {
    modelInfo = {};
  }
  const tools = fetchLiveToolStats([id]).get(id) ?? { tool_calls: 0, tool_errors: 0 };

  return {
    session_id: row.id,
    project_id: row.project_id,
    slug: projectSlugFromWorktree(row.worktree, null, row.project_id),
    title: row.title === null ? null : redactText(row.title),
    parent_id: row.parent_id,
    is_subagent: row.parent_id ? 1 : 0,
    agent: row.agent,
    model: row.model,
    time_created: row.time_created,
    time_updated: row.time_updated,
    tokens_input: row.tokens_input,
    tokens_output: row.tokens_output,
    tokens_reasoning: row.tokens_reasoning,
    tokens_cache_read: row.tokens_cache_read,
    tokens_cache_write: row.tokens_cache_write,
    cost: row.cost,
    summary_additions: row.summary_additions,
    summary_deletions: row.summary_deletions,
    summary_files: row.summary_files,
    tool_calls: tools.tool_calls,
    tool_errors: tools.tool_errors,
    tool_error_rate: tools.tool_calls > 0 ? tools.tool_errors / tools.tool_calls : null,
    patch_count: 0,
    apply_patch_ok: 0,
    apply_patch_err: 0,
    compaction_count: 0,
    reasoning_parts: null,
    text_parts: null,
    file_parts: null,
    msg_count: null,
    assistant_msgs: null,
    trunc_length: null,
    avg_latency_s: null,
    active_min: null,
    bursts: null,
    max_gap_h: null,
    flags: "",
    dominant_model_id: modelInfo.id ?? null,
    dominant_provider_id: modelInfo.providerID ?? null,
    dominant_variant: modelInfo.variant ?? null,
    spawn_depth: null,
    live_fallback: true,
  };
}

app.get("/api/session/:id", (c) => {
  const id = c.req.param("id");
  const row = db.query(`SELECT * FROM session_metrics WHERE session_id = ?`).get(id);
  if (row) return c.json(redactValue(row));
  const liveFallback = buildLiveSessionFallback(id);
  if (liveFallback) return c.json(redactValue(liveFallback));
  return c.json({ error: "session not found" }, 404);
});

const TEXT_FIELD_LIMIT = 4000;

function truncateText(raw: unknown): { value: string; truncated: boolean; full_len?: number } {
  const s = typeof raw === "string" ? redactText(raw) : "";
  if (s.length <= TEXT_FIELD_LIMIT) return { value: s, truncated: false };
  return { value: s.slice(0, TEXT_FIELD_LIMIT), truncated: true, full_len: s.length };
}

function truncateAny(raw: unknown): { value: unknown; truncated: boolean; full_len?: number } {
  if (raw === undefined || raw === null) return { value: null, truncated: false };
  const redacted = redactValue(raw);
  if (typeof redacted === "string") return truncateText(redacted);
  const json = redactText(JSON.stringify(redacted));
  if (json.length <= TEXT_FIELD_LIMIT) return { value: redacted, truncated: false };
  return { value: json.slice(0, TEXT_FIELD_LIMIT), truncated: true, full_len: json.length };
}

type PartRow = { message_id: string; id: string; time_created: number; data: string };
type MessageRow = { id: string; time_created: number; data: string };

function normalizePart(row: PartRow): Record<string, unknown> {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(row.data);
  } catch {
    raw = {};
  }
  const type = typeof raw.type === "string" ? raw.type : "unknown";
  switch (type) {
    case "text": {
      const t = truncateText(raw.text);
      return { id: row.id, type, text: t.value, truncated: t.truncated, full_len: t.full_len, synthetic: !!raw.synthetic };
    }
    case "reasoning": {
      const t = truncateText(raw.text);
      return { id: row.id, type, text: t.value, truncated: t.truncated, full_len: t.full_len };
    }
    case "tool": {
      const state = (raw.state ?? {}) as Record<string, unknown>;
      const input = truncateAny(state.input);
      const output = truncateAny(state.output);
      const error = truncateAny(state.error);
      const time = (state.time ?? {}) as Record<string, unknown>;
      const start = time.start;
      const end = time.end;
      return {
        id: row.id,
        type,
        tool: raw.tool ?? null,
        status: state.status ?? null,
        title: typeof state.title === "string" ? redactText(state.title) : state.title ?? null,
        duration_s: typeof start === "number" && typeof end === "number" ? (end - start) / 1000 : null,
        input: input.value,
        input_truncated: input.truncated,
        input_full_len: input.full_len,
        output: output.value,
        output_truncated: output.truncated,
        output_full_len: output.full_len,
        error: error.value,
        error_truncated: error.truncated,
      };
    }
    case "patch":
      return { id: row.id, type, hash: raw.hash ?? null, files: Array.isArray(raw.files) ? redactValue(raw.files.slice(0, 500)) : [] };
    case "file":
      return { id: row.id, type, path: typeof raw.path === "string" ? redactText(raw.path) : typeof raw.filename === "string" ? redactText(raw.filename) : null, mime: raw.mime ?? null };
    case "step-finish":
      return { id: row.id, type, reason: typeof raw.reason === "string" ? redactText(raw.reason) : raw.reason ?? null, cost: raw.cost ?? null, tokens: raw.tokens ?? null };
    case "step-start":
      return { id: row.id, type };
    case "compaction":
      return { id: row.id, type, auto: raw.auto ?? null };
    case "agent":
      return { id: row.id, type };
    case "subtask": {
      const prompt = truncateText(typeof raw.prompt === "string" ? redactText(raw.prompt) : "");
      return {
        id: row.id,
        type,
        agent: typeof raw.agent === "string" ? redactText(raw.agent) : raw.agent ?? null,
        description: typeof raw.description === "string" ? redactText(raw.description) : raw.description ?? null,
        command: typeof raw.command === "string" ? redactText(raw.command) : raw.command ?? null,
        model: typeof raw.model === "string" ? redactText(raw.model) : raw.model ?? null,
        prompt: prompt.value,
        prompt_truncated: prompt.truncated,
        prompt_full_len: prompt.full_len,
      };
    }
    default:
      return { id: row.id, type };
  }
}

function normalizeMessage(row: MessageRow, parts: PartRow[]): Record<string, unknown> {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(row.data);
  } catch {
    raw = {};
  }
  const model = (raw.model ?? {}) as Record<string, unknown>;
  const time = (raw.time ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    role: raw.role ?? null,
    model_id: raw.modelID ?? model.modelID ?? null,
    provider_id: raw.providerID ?? model.providerID ?? null,
    variant: raw.variant ?? model.variant ?? null,
    agent: raw.agent ?? null,
    mode: raw.mode ?? null,
    tokens: raw.tokens ?? null,
    time_created: row.time_created,
    time_completed: time.completed ?? null,
    finish: raw.finish ?? null,
    cost: raw.cost ?? null,
    parts: parts.map(normalizePart),
  };
}

app.get("/api/session/:id/transcript", (c) => {
  const id = c.req.param("id");
  const limit = parseBoundedInt(c.req.query("limit"), { fallback: 40, min: 1, max: 100 });
  const offset = parseBoundedInt(c.req.query("offset"), { fallback: 0, min: 0, max: 10_000 });

  const totalRow = src.query(`SELECT COUNT(*) AS n FROM message WHERE session_id = ?`).get(id) as
    | { n: number }
    | null;
  const total_messages = totalRow?.n ?? 0;

  const msgRows = src
    .query(`SELECT id, time_created, data FROM message WHERE session_id = ? ORDER BY time_created, id LIMIT ? OFFSET ?`)
    .all(id, limit, offset) as MessageRow[];

  if (msgRows.length === 0) {
    return c.json({ total_messages, offset, limit, messages: [] });
  }

  const ids = msgRows.map((m) => m.id);
  const placeholders = ids.map(() => "?").join(",");
  const partRows = src
    .query(
      `SELECT message_id, id, time_created, data FROM part
       WHERE session_id = ? AND message_id IN (${placeholders})
       ORDER BY message_id, id`,
    )
    .all(id, ...ids) as PartRow[];

  const partsByMsg = new Map<string, PartRow[]>();
  for (const p of partRows) {
    const arr = partsByMsg.get(p.message_id) ?? [];
    arr.push(p);
    partsByMsg.set(p.message_id, arr);
  }

  const messages = msgRows.map((m) => normalizeMessage(m, partsByMsg.get(m.id) ?? []));
  return c.json({ total_messages, offset, limit, messages });
});

// ---------- live view (Phase 1: read-only, near-real-time) ----------
// Reads directly from `src` (the live opencode.db), never from the batch
// cache, so results reflect sessions that are still running right now.
// Overlays per-session poll telemetry parsed from the oh-my-opencode.log
// tail (every opencode process on a machine shares the same os.tmpdir(),
// so one file covers every project) to surface "still busy vs actually
// stuck" -- a distinction the DB alone cannot make, since time_updated
// only tells you something was written, not whether it represents real
// progress.

const LOG_PATH = CONFIG.logPath ?? `${tmpdir()}/oh-my-opencode.log`;
const LOG_TAIL_BYTES = 1_500_000; // tail only; the source log rotates at 50MB
const LIVE_MAX_SESSIONS = 300;
const LIVE_ANCESTOR_MAX_DEPTH = 20;
const LIVE_TERMINAL_EVENT_WINDOW_MS = 30 * 60_000;

function readLogTail(path: string, maxBytes: number): string {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return "";
  }
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    if (length <= 0) return "";
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, start);
    return new TextDecoder().decode(buf);
  } catch {
    return "";
  } finally {
    closeSync(fd);
  }
}

type LiveLogSignal = {
  session_id: string;
  status: string | null;
  elapsed_s: number | null;
  inactive_s: number | null;
  tool_calls: number | null;
  last_seen_at: number;
  terminal_event: string | null;
  terminal_event_at: number | null;
};

const LOG_LINE_RE = /^\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.*)$/;
const LOG_JSON_RE = /\{.*\}\s*$/;

function parseDurationSeconds(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const n = Number(raw.replace(/s$/, ""));
  return Number.isFinite(n) ? n : null;
}

// Classifies one [task]/[call_omo_agent] log line into a terminal event
// name when it represents an abort/timeout/error; null for routine
// progress lines (poll status, starting poll loop, and so on).
function classifyTerminalEvent(tag: string, msg: string, json: Record<string, unknown> | null): string | null {
  if (tag !== "task" && tag !== "call_omo_agent") return null;
  if (msg.includes("Poll inactivity timeout reached")) return "poll_timeout";
  if (msg.includes("Max assistant turns reached")) return "max_turns";
  if (msg.includes("Aborted by user")) return "aborted_by_user";
  if (msg.includes("Poll detected terminal session error")) return "terminal_error";
  if (msg.includes("Aborting sync session")) {
    const reason = typeof json?.reason === "string" ? redactText(json.reason) : "unknown";
    return `aborted:${reason}`;
  }
  return null;
}

function parseLiveLogSignals(text: string): Map<string, LiveLogSignal> {
  const out = new Map<string, LiveLogSignal>();
  if (!text) return out;
  for (const line of text.split("\n")) {
    const m = LOG_LINE_RE.exec(line);
    if (!m) continue;
    const [, tsRaw, tag, rest] = m;
    const jm = LOG_JSON_RE.exec(rest);
    let json: Record<string, unknown> | null = null;
    let msg = rest;
    if (jm) {
      try {
        json = JSON.parse(jm[0]) as Record<string, unknown>;
        msg = rest.slice(0, rest.length - jm[0].length).trim();
      } catch {
        json = null;
      }
    }
    const sessionId = json && typeof json.sessionID === "string" ? json.sessionID : null;
    if (!sessionId) continue;
    const ts = Date.parse(tsRaw);
    if (!Number.isFinite(ts)) continue;

    const entry: LiveLogSignal = out.get(sessionId) ?? {
      session_id: sessionId,
      status: null,
      elapsed_s: null,
      inactive_s: null,
      tool_calls: null,
      last_seen_at: 0,
      terminal_event: null,
      terminal_event_at: null,
    };

    if (ts >= entry.last_seen_at) {
      entry.last_seen_at = ts;
      if (typeof json?.sessionStatus === "string") entry.status = json.sessionStatus;
      const elapsed = parseDurationSeconds(json?.elapsed);
      if (elapsed !== null) entry.elapsed_s = elapsed;
      const inactive = parseDurationSeconds(json?.inactiveElapsed);
      if (inactive !== null) entry.inactive_s = inactive;
      if (typeof json?.toolCalls === "number") entry.tool_calls = json.toolCalls;
    }

    const terminalEvent = classifyTerminalEvent(tag, msg, json);
    if (terminalEvent && (entry.terminal_event_at === null || ts >= entry.terminal_event_at)) {
      entry.terminal_event = terminalEvent;
      entry.terminal_event_at = ts;
    }

    out.set(sessionId, entry);
  }
  return out;
}

type LiveSessionRow = {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string | null;
  agent: string | null;
  model: string | null;
  directory: string | null;
  time_created: number;
  time_updated: number;
  tokens_input: number;
  tokens_output: number;
  tokens_reasoning: number;
  worktree: string | null;
};

const LIVE_SESSION_SELECT = `SELECT s.id, s.project_id, s.parent_id, s.title, s.agent, s.model, s.directory,
         s.time_created, s.time_updated,
         s.tokens_input, s.tokens_output, s.tokens_reasoning,
         p.worktree
  FROM session s LEFT JOIN project p ON p.id = s.project_id`;

function fetchLiveSessions(sinceTs: number): Map<string, LiveSessionRow> {
  const rows = src
    .query(`${LIVE_SESSION_SELECT} WHERE s.time_updated >= ? ORDER BY s.time_updated DESC LIMIT ?`)
    .all(sinceTs, LIVE_MAX_SESSIONS) as LiveSessionRow[];

  const byId = new Map<string, LiveSessionRow>(rows.map((r) => [r.id, r]));

  // Walk the parent chain so an active leaf still renders under its real
  // root, even when the ancestor itself has gone quiet.
  let frontier = rows.map((r) => r.parent_id).filter((id): id is string => !!id && !byId.has(id));
  for (let depth = 0; depth < LIVE_ANCESTOR_MAX_DEPTH && frontier.length > 0; depth++) {
    const placeholders = frontier.map(() => "?").join(",");
    const ancestorRows = src
      .query(`${LIVE_SESSION_SELECT} WHERE s.id IN (${placeholders})`)
      .all(...frontier) as LiveSessionRow[];
    for (const r of ancestorRows) byId.set(r.id, r);
    frontier = ancestorRows.map((r) => r.parent_id).filter((id): id is string => !!id && !byId.has(id));
  }

  return byId;
}

type LiveToolStats = {
  tool_calls: number;
  tool_errors: number;
  last_tool_at: number | null;
  last_tool_name: string | null;
  last_tool_title: string | null;
  last_text_at: number | null;
  last_text_snippet: string | null;
};

const LIVE_SNIPPET_MAX_CHARS = 160;

// Scans every part row once and derives BOTH the tool call/error counters
// AND "what is it actually doing right now" (last tool title, last bit of
// text/reasoning) from the same rows -- no extra query needed. This is the
// data the UI shows when you expand a node, so "green" is backed by an
// actual observed action, not just a timestamp.
function fetchLiveToolStats(sessionIds: string[]): Map<string, LiveToolStats> {
  const out = new Map<string, LiveToolStats>();
  if (sessionIds.length === 0) return out;
  const placeholders = sessionIds.map(() => "?").join(",");
  const rows = src
    .query(`SELECT session_id, time_created, data FROM part WHERE session_id IN (${placeholders})`)
    .all(...sessionIds) as Array<{ session_id: string; time_created: number; data: string }>;
  for (const r of rows) {
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(r.data);
    } catch {
      continue;
    }
    const stats: LiveToolStats =
      out.get(r.session_id) ?? {
        tool_calls: 0,
        tool_errors: 0,
        last_tool_at: null,
        last_tool_name: null,
        last_tool_title: null,
        last_text_at: null,
        last_text_snippet: null,
      };
    if (raw.type === "tool") {
      stats.tool_calls++;
      const state = (raw.state ?? {}) as Record<string, unknown>;
      if (state.status === "error") stats.tool_errors++;
      if (stats.last_tool_at === null || r.time_created > stats.last_tool_at) {
        stats.last_tool_at = r.time_created;
        stats.last_tool_name = typeof raw.tool === "string" ? raw.tool : null;
        stats.last_tool_title = typeof state.title === "string" ? redactText(state.title) : null;
      }
    } else if (raw.type === "text" || raw.type === "reasoning") {
      const text = typeof raw.text === "string" ? redactText(raw.text).trim() : "";
      if (text && (stats.last_text_at === null || r.time_created > stats.last_text_at)) {
        stats.last_text_at = r.time_created;
        stats.last_text_snippet = text.length > LIVE_SNIPPET_MAX_CHARS ? text.slice(0, LIVE_SNIPPET_MAX_CHARS) + "…" : text;
      }
    }
    out.set(r.session_id, stats);
  }
  return out;
}

// Mirrors delegate-task's own `isSessionComplete()` / `getTerminalSessionError()`
// (packages/omo-opencode/src/tools/delegate-task/sync-session-turns.ts) so the
// live view agrees with the exact ground truth the poller itself uses to decide
// a task is done, instead of guessing from "nothing logged in N minutes" --
// which is indistinguishable from "finished cleanly a while ago".
const NON_TERMINAL_FINISH_REASONS = new Set(["tool-calls", "unknown"]);
const PENDING_TOOL_PART_TYPES = new Set(["tool", "tool_use", "tool-call"]);

type LiveCompletion = { isComplete: boolean; hasDbError: boolean };

function fetchLiveCompletionSignals(sessionIds: string[]): Map<string, LiveCompletion> {
  const out = new Map<string, LiveCompletion>();
  if (sessionIds.length === 0) return out;
  const placeholders = sessionIds.map(() => "?").join(",");

  // Filtering by role in SQL (not "last N messages of any role") matters:
  // a subagent session can have exactly one user turn followed by dozens of
  // assistant/tool-call turns, so "last 8 messages" can miss the only user
  // message entirely and make a finished session look incomplete.
  const lastAssistantRows = src
    .query(
      `SELECT id, session_id, data FROM (
         SELECT id, session_id, data, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id DESC) AS rn
         FROM message WHERE session_id IN (${placeholders}) AND json_extract(data, '$.role') = 'assistant'
       ) WHERE rn <= 2`,
    )
    .all(...sessionIds) as Array<{ id: string; session_id: string; data: string }>;

  const lastUserRows = src
    .query(
      `SELECT id, session_id FROM (
         SELECT id, session_id, ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY id DESC) AS rn
         FROM message WHERE session_id IN (${placeholders}) AND json_extract(data, '$.role') = 'user'
       ) WHERE rn <= 1`,
    )
    .all(...sessionIds) as Array<{ id: string; session_id: string }>;

  const lastRelevantUserIdBySession = new Map<string, string>(lastUserRows.map((r) => [r.session_id, r.id]));

  type AssistantMsg = { id: string; finish: string | null; hasError: boolean };
  const assistantBySession = new Map<string, AssistantMsg[]>();
  for (const r of lastAssistantRows) {
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(r.data);
    } catch {
      continue;
    }
    const arr = assistantBySession.get(r.session_id) ?? [];
    arr.push({
      id: r.id,
      finish: typeof raw.finish === "string" ? raw.finish : null,
      hasError: "error" in raw && raw.error != null,
    });
    assistantBySession.set(r.session_id, arr);
  }

  const lastAssistantBySession = new Map<string, AssistantMsg>();
  for (const [sessionId, arr] of assistantBySession) {
    arr.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)); // newest first
    const newest = arr[0];
    if (newest) lastAssistantBySession.set(sessionId, newest);
  }

  const assistantIds = [...lastAssistantBySession.values()].map((m) => m.id);
  const pendingToolByAssistantId = new Set<string>();
  if (assistantIds.length > 0) {
    const assistantPlaceholders = assistantIds.map(() => "?").join(",");
    const partRows = src
      .query(`SELECT message_id, data FROM part WHERE message_id IN (${assistantPlaceholders})`)
      .all(...assistantIds) as Array<{ message_id: string; data: string }>;
    for (const r of partRows) {
      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(r.data);
      } catch {
        continue;
      }
      if (typeof raw.type === "string" && PENDING_TOOL_PART_TYPES.has(raw.type)) pendingToolByAssistantId.add(r.message_id);
    }
  }

  for (const sessionId of sessionIds) {
    const lastAssistant = lastAssistantBySession.get(sessionId);
    const lastRelevantUserId = lastRelevantUserIdBySession.get(sessionId);
    const isComplete = Boolean(
      lastAssistant?.finish &&
        !NON_TERMINAL_FINISH_REASONS.has(lastAssistant.finish) &&
        !pendingToolByAssistantId.has(lastAssistant.id) &&
        lastRelevantUserId !== undefined &&
        lastAssistant !== undefined &&
        lastRelevantUserId < lastAssistant.id,
    );
    const hasDbError = Boolean(
      lastAssistant?.hasError && (lastRelevantUserId === undefined || lastAssistant.id > lastRelevantUserId),
    );
    out.set(sessionId, { isComplete, hasDbError });
  }

  return out;
}

type LiveHealth = "green" | "yellow" | "red" | "idle" | "done";

// A poller line older than this means the delegate-task poller is no
// longer watching this session -- the task concluded one way or another,
// it is not "stuck", it simply is not being observed live anymore.
const LIVE_POLLER_STALE_MS = 10 * 60_000;

// Reconciles the poller's self-reported inactivity against the DB's own
// staleness reading. The poller's number is normally more precise (it
// knows about one legitimately slow-but-progressing tool call the DB touch
// alone can't see) but it can also lie in the *optimistic* direction:
// observed in production, it kept reporting "busy, 0s inactive" via a log
// line written mere seconds ago, while tool_calls/tokens in the DB had not
// moved in 30-60+ minutes -- a genuinely stuck session the log alone made
// invisible. Whichever of the two reads is more pessimistic wins, so this
// number is the one source of truth both classifyHealth AND the UI's
// displayed "last real activity" column should use -- never the raw
// logInactiveS alone.
export function computeInactiveMs(input: {
  now: number;
  dbLastUpdate: number;
  logLastSeenAt: number | null;
  logInactiveS: number | null;
}): number {
  const pollerActive = input.logLastSeenAt !== null && input.now - input.logLastSeenAt < LIVE_POLLER_STALE_MS;
  const lastActivity = Math.max(input.dbLastUpdate, input.logLastSeenAt ?? 0);
  const dbInactiveMs = input.now - input.dbLastUpdate;
  return pollerActive && input.logInactiveS !== null
    ? Math.max(input.logInactiveS * 1000, dbInactiveMs)
    : input.now - lastActivity;
}

export function classifyHealth(input: {
  now: number;
  hasParent: boolean;
  dbLastUpdate: number;
  logLastSeenAt: number | null;
  logInactiveS: number | null;
  terminalEvent: string | null;
  terminalEventAt: number | null;
  toolCalls: number;
  toolErrors: number;
  isComplete: boolean;
  hasDbError: boolean;
    }): LiveHealth {
  const hasRecentTerminalEvent =
    input.terminalEvent !== null &&
    input.terminalEventAt !== null &&
    input.now - input.terminalEventAt < LIVE_TERMINAL_EVENT_WINDOW_MS;

  // Ground truth first: the DB already tells us whether the last assistant
  // turn actually finished cleanly (same check delegate-task itself uses to
  // decide when task() returns). If it did, the session is not "stuck" no
  // matter how long ago that was -- "finished 8 minutes ago" and "frozen 8
  // minutes ago" are NOT the same thing, and only the DB can tell them apart.
  if (input.isComplete) {
    if (input.hasDbError || (hasRecentTerminalEvent && input.hasParent)) return "red";
    return input.hasParent ? "done" : "idle";
  }

  // Below this line the message-based check could not confirm a clean
  // finish (either the turn is genuinely still open, or this session type
  // never populates messages the usual way -- e.g. look_at/vision calls).

  // A hot tool-error streak is worth flagging regardless of liveness.
  if (input.toolCalls >= 5 && input.toolErrors / input.toolCalls > 0.4) return "red";
  // Any terminal event -- abort, timeout, max-turns -- closes the case
  // immediately, no grace period. This is deliberately NOT gated on
  // recency: an explicit user-initiated abort (parent_abort, i.e. someone
  // pressed Esc) is a decision already made, not fresh news to keep
  // flashing red. It also protects against a real observed failure mode:
  // the underlying session can keep reporting log_status="busy" long after
  // being aborted (the abort call doesn't necessarily stop the provider
  // stream), which would otherwise re-trigger the staleness heuristics
  // below and mark an already-closed session as suspicious forever. The
  // terminal_event badge in the UI still shows the abort reason regardless
  // of this health label, so the information is not lost -- it just stops
  // demanding attention.
  if (input.terminalEvent !== null) return input.hasParent ? "done" : "idle";

  const pollerActive = input.logLastSeenAt !== null && input.now - input.logLastSeenAt < LIVE_POLLER_STALE_MS;

  if (input.hasParent && !pollerActive) {
    // Nobody is actively watching this delegation right now. Whatever the
    // reason the message-based check was inconclusive, "quiet and unwatched"
    // is not evidence of being stuck -- only "quiet while something is still
    // actively polling it" is.
    return "done";
  }

  const inactiveMs = computeInactiveMs(input);

  if (inactiveMs >= 5 * 60_000) return input.hasParent ? "red" : "idle";
  if (inactiveMs >= 60_000) return "yellow";
  return "green";
}

function projectSlugFromWorktree(worktree: string | null, directory: string | null, projectId: string): string {
  const fromWorktree = worktree ? worktree.split("/").filter(Boolean).pop() : null;
  if (fromWorktree) return fromWorktree;
  const fromDirectory = directory ? directory.split("/").filter(Boolean).pop() : null;
  if (fromDirectory) return fromDirectory;
  return projectId.slice(0, 8);
}

app.get("/api/live", (c) => {
  const sinceMin = parseBoundedInt(c.req.query("since_min"), { fallback: 180, min: 5, max: 720 });
  const now = Date.now();
  const sinceTs = now - sinceMin * 60_000;

  const sessions = fetchLiveSessions(sinceTs);
  const sessionIds = [...sessions.keys()];
  const toolStats = fetchLiveToolStats(sessionIds);
  const completion = fetchLiveCompletionSignals(sessionIds);
  const logSignals = parseLiveLogSignals(readLogTail(LOG_PATH, LOG_TAIL_BYTES));

  const nodes = [...sessions.values()].map((s) => {
    const id = s.id;
    const tools: LiveToolStats =
      toolStats.get(id) ?? {
        tool_calls: 0,
        tool_errors: 0,
        last_tool_at: null,
        last_tool_name: null,
        last_tool_title: null,
        last_text_at: null,
        last_text_snippet: null,
      };
    const comp = completion.get(id) ?? { isComplete: false, hasDbError: false };
    const log = logSignals.get(id) ?? null;
    const inactiveMs = computeInactiveMs({
      now,
      dbLastUpdate: s.time_updated,
      logLastSeenAt: log?.last_seen_at ?? null,
      logInactiveS: log?.inactive_s ?? null,
    });
    const health = classifyHealth({
      now,
      hasParent: s.parent_id !== null,
      dbLastUpdate: s.time_updated,
      logLastSeenAt: log?.last_seen_at ?? null,
      logInactiveS: log?.inactive_s ?? null,
      terminalEvent: log?.terminal_event ?? null,
      terminalEventAt: log?.terminal_event_at ?? null,
      toolCalls: tools.tool_calls,
      toolErrors: tools.tool_errors,
      isComplete: comp.isComplete,
      hasDbError: comp.hasDbError,
    });
    return {
      session_id: s.id,
      project_id: s.project_id,
      project_slug: projectSlugFromWorktree(s.worktree, s.directory, s.project_id),
      parent_id: s.parent_id,
      title: s.title === null ? null : redactText(s.title),
      agent: s.agent,
      model: s.model,
      time_created: s.time_created,
      time_updated: s.time_updated,
      tokens: s.tokens_input + s.tokens_output + s.tokens_reasoning,
      tool_calls: tools.tool_calls,
      tool_errors: tools.tool_errors,
      last_tool_name: tools.last_tool_name,
      last_tool_title: tools.last_tool_title,
      last_tool_at: tools.last_tool_at,
      last_text_snippet: tools.last_text_snippet,
      last_text_at: tools.last_text_at,
      is_complete: comp.isComplete,
      log_status: log?.status ?? null,
      log_elapsed_s: log?.elapsed_s ?? null,
      log_inactive_s: log?.inactive_s ?? null,
      log_tool_calls: log?.tool_calls ?? null,
      log_last_seen_at: log?.last_seen_at ?? null,
      terminal_event: log?.terminal_event ?? null,
      // Reconciled "last real activity" timestamp -- max(poller, DB), never
      // just the poller's raw self-reported number. Use this for display
      // instead of log_inactive_s directly (kept below only as a raw
      // diagnostic breadcrumb).
      last_real_activity_at: now - inactiveMs,
      health,
    };
  });

  return c.json({ generated_at: now, since_min: sinceMin, nodes });
});

console.log(`OpencodeView API at http://${CONFIG.hostname}:${PORT} (cache/source paths hidden, redaction=enabled)`);
export default { port: PORT, hostname: CONFIG.hostname, fetch: app.fetch };
