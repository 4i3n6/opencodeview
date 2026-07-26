import { Database } from "bun:sqlite";
import { chmodSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { assertDistinctDbPaths, preparePrivateOutputPath } from "./db-paths.ts";
import { wilson } from "./stats";

const CACHE_DB = process.env.OPENCODEVIEW_CACHE ?? join(import.meta.dir, "..", ".cache", "analytics.sqlite");
const SRC_DB = process.env.OPENCODE_DB ?? join(homedir(), ".local", "share", "opencode", "opencode.db");
const REPORT_PATH = join(import.meta.dir, "..", ".cache", "compaction-impact.md");
const CHUNK_SIZE = 300;

export type ToolBucket = { readonly tools: number; readonly errors: number };
export type CompactionEvent = {
  readonly kind: "tool" | "compaction";
  readonly sessionId: string;
  readonly projectId: string;
  readonly slug: string;
  readonly order: number;
  readonly errored?: boolean;
};
export type SessionImpact = {
  readonly projectId: string;
  readonly slug: string;
  readonly sessionId: string;
  readonly compactions: number;
  readonly pre: ToolBucket;
  readonly post: ToolBucket;
  readonly deltaRate: number;
};
export type AggregateImpact = SessionImpact & {
  readonly sessions: number;
  readonly preRate: number;
  readonly postRate: number;
  readonly deltaLow: number;
  readonly deltaHigh: number;
};

type SessionContext = { readonly sessionId: string; readonly projectId: string; readonly slug: string; readonly events: readonly CompactionEvent[] };
type ImpactInput = { readonly projectId: string; readonly slug: string; readonly sessionId: string; readonly compactions: number; readonly preTools: number; readonly preErrors: number; readonly postTools: number; readonly postErrors: number };
type RawCacheSession = { readonly session_id: string; readonly project_id: string; readonly slug: string };
type RawEvent = { readonly session_id: string; readonly kind: string | null; readonly status: string | null };

class CompactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompactionError";
  }
}

function ratio(errors: number, tools: number): number {
  return tools > 0 ? errors / tools : 0;
}

export function wilsonDifferenceInterval(input: { readonly preErrors: number; readonly preTools: number; readonly postErrors: number; readonly postTools: number }): { readonly low: number; readonly high: number } {
  if (input.preTools === 0 && input.postTools === 0) return { low: 0, high: 0 };
  const pre = wilson(input.preErrors, input.preTools);
  const post = wilson(input.postErrors, input.postTools);
  return { low: post.lo - pre.hi, high: post.hi - pre.lo };
}

export function computeCompactionImpact(input: ImpactInput): SessionImpact {
  const pre = { tools: input.preTools, errors: input.preErrors };
  const post = { tools: input.postTools, errors: input.postErrors };
  return { projectId: input.projectId, slug: input.slug, sessionId: input.sessionId, compactions: input.compactions, pre, post, deltaRate: ratio(post.errors, post.tools) - ratio(pre.errors, pre.tools) };
}

export function summarizeCompactionSession(context: SessionContext): SessionImpact {
  const ordered = [...context.events].sort((left, right) => left.order - right.order);
  let seenCompaction = false;
  let compactions = 0;
  let preTools = 0;
  let preErrors = 0;
  let postTools = 0;
  let postErrors = 0;
  for (const event of ordered) {
    if (event.kind === "compaction") {
      seenCompaction = true;
      compactions++;
      continue;
    }
    if (seenCompaction) {
      postTools++;
      if (event.errored === true) postErrors++;
    } else {
      preTools++;
      if (event.errored === true) preErrors++;
    }
  }
  return computeCompactionImpact({ projectId: context.projectId, slug: context.slug, sessionId: context.sessionId, compactions, preTools, preErrors, postTools, postErrors });
}

export function aggregateCompactionSummaries(summaries: readonly SessionImpact[], projectId: string, slug: string): AggregateImpact {
  const totals = summaries.reduce(
    (acc, item) => ({
      compactions: acc.compactions + item.compactions,
      preTools: acc.preTools + item.pre.tools,
      preErrors: acc.preErrors + item.pre.errors,
      postTools: acc.postTools + item.post.tools,
      postErrors: acc.postErrors + item.post.errors,
    }),
    { compactions: 0, preTools: 0, preErrors: 0, postTools: 0, postErrors: 0 },
  );
  const interval = wilsonDifferenceInterval(totals);
  return {
    projectId,
    slug,
    sessionId: "*",
    sessions: summaries.length,
    compactions: totals.compactions,
    pre: { tools: totals.preTools, errors: totals.preErrors },
    post: { tools: totals.postTools, errors: totals.postErrors },
    preRate: ratio(totals.preErrors, totals.preTools),
    postRate: ratio(totals.postErrors, totals.postTools),
    deltaRate: ratio(totals.postErrors, totals.postTools) - ratio(totals.preErrors, totals.preTools),
    deltaLow: interval.low,
    deltaHigh: interval.high,
  };
}

function openReadOnly(path: string): Database {
  if (!existsSync(path)) throw new CompactionError(`Database not found: ${path}`);
  const db = new Database(path, { readonly: true });
  try {
    db.run("PRAGMA query_only = 1");
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function loadCompactionSessions(cache: Database, filter: string | null): readonly RawCacheSession[] {
  const where = filter === null ? "" : "AND (project_id = ? OR slug = ?)";
  const query = cache.query<RawCacheSession, [string, string] | []>(`
    SELECT session_id, project_id, slug
    FROM session_metrics
    WHERE COALESCE(compaction_count, 0) > 0 ${where}
    ORDER BY project_id, session_id
  `);
  return filter === null ? query.all() : query.all(filter, filter);
}

function groupByProject(rows: readonly RawCacheSession[]): readonly (readonly RawCacheSession[])[] {
  const groups = new Map<string, RawCacheSession[]>();
  for (const row of rows) {
    const key = `${row.project_id}\u0000${row.slug}`;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }
  return [...groups.values()];
}

function fetchEventsForSessions(src: Database, projectId: string, sessions: readonly RawCacheSession[]): readonly CompactionEvent[] {
  if (sessions.length === 0) return [];
  const placeholders = sessions.map(() => "?").join(",");
  const rows = src
    .query<RawEvent, string[]>(`
      SELECT p.session_id, p.id AS part_id, m.time_created AS message_time,
        json_extract(p.data,'$.type') AS kind,
        json_extract(p.data,'$.state.status') AS status
      FROM part p
      JOIN session s ON s.id = p.session_id
      JOIN message m ON m.id = p.message_id
      WHERE s.project_id = ?
        AND p.session_id IN (${placeholders})
        AND json_extract(p.data,'$.type') IN ('tool','compaction')
      ORDER BY p.session_id, m.time_created, p.id
    `)
    .all(projectId, ...sessions.map((session) => session.session_id));
  const metadata = new Map(sessions.map((session) => [session.session_id, session]));
  return rows.flatMap((row, index) => {
    const session = metadata.get(row.session_id);
    if (session === undefined || (row.kind !== "tool" && row.kind !== "compaction")) return [];
    return [{ kind: row.kind, sessionId: row.session_id, projectId: session.project_id, slug: session.slug, order: index, errored: row.status === "error" }];
  });
}

function summarizeProject(src: Database, sessions: readonly RawCacheSession[]): readonly SessionImpact[] {
  const bySession = new Map<string, CompactionEvent[]>();
  for (let index = 0; index < sessions.length; index += CHUNK_SIZE) {
    const chunk = sessions.slice(index, index + CHUNK_SIZE);
    for (const event of fetchEventsForSessions(src, sessions[0].project_id, chunk)) {
      const current = bySession.get(event.sessionId) ?? [];
      current.push(event);
      bySession.set(event.sessionId, current);
    }
  }
  return sessions.map((session) => summarizeCompactionSession({ sessionId: session.session_id, projectId: session.project_id, slug: session.slug, events: bySession.get(session.session_id) ?? [] }));
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function buildReport(corpus: AggregateImpact, projects: readonly AggregateImpact[]): string {
  const sorted = [...projects].sort((left, right) => right.sessions - left.sessions);
  const projectRows = sorted.map((item) => `| ${item.slug} | ${item.sessions} | ${item.compactions} | ${formatPercent(item.preRate)} | ${formatPercent(item.postRate)} | ${formatPercent(item.deltaRate)} | ${formatPercent(item.deltaLow)} to ${formatPercent(item.deltaHigh)} |`).join("\n");
  const verdict = corpus.deltaLow > 0 ? "Yes, there is statistical evidence of degradation after compaction." : corpus.deltaHigh < 0 ? "No; the corpus suggests improvement after compaction." : "Inconclusive; the interval crosses zero.";
  const action = corpus.deltaLow > 0.02 ? "Open a new session when the first compaction occurs in an already noisy session or when the post-compaction error rate exceeds the pre-compaction rate by more than two percentage points." : "There is no strong signal to end sessions automatically; prefer opening a new session when tool errors occur consecutively after compaction.";
  return `# Compaction impact on tools

Read-only analysis of \`opencode.db\`, always scoped by \`project_id\` and by the list of sessions with compaction already materialized in the cache.

## Direct answer

${verdict}

- Sessions analyzed: ${corpus.sessions}
- Compactions: ${corpus.compactions}
- Error rate before the first compaction: ${formatPercent(corpus.preRate)} (${corpus.pre.errors}/${corpus.pre.tools})
- Error rate after any compaction: ${formatPercent(corpus.postRate)} (${corpus.post.errors}/${corpus.post.tools})
- Post - pre difference: ${formatPercent(corpus.deltaRate)}; conservative Wilson CI: ${formatPercent(corpus.deltaLow)} to ${formatPercent(corpus.deltaHigh)}

## When to open a new session

${action}

## Projects with N >= 30 sessions

| project | sessions | compactions | pre error | post error | difference | difference CI |
|---|---:|---:|---:|---:|---:|---|
${projectRows || "| none | 0 | 0 | 0.00% | 0.00% | 0.00% | 0.00% to 0.00% |"}
`;
}

export function runCompactionImpact(filter: string | null = process.argv[2] ?? null, cachePath = CACHE_DB, srcPath = SRC_DB, reportPath = REPORT_PATH): AggregateImpact {
  assertDistinctDbPaths(srcPath, cachePath);
  const preparedReport = preparePrivateOutputPath({ outputPath: reportPath, forbiddenPaths: [srcPath, cachePath], outputKind: "Report" });
  let cache: Database | null = null;
  let src: Database | null = null;
  try {
    const cacheDb = openReadOnly(cachePath);
    cache = cacheDb;
    const srcDb = openReadOnly(srcPath);
    src = srcDb;
    const sessions = loadCompactionSessions(cacheDb, filter);
    const summaries = groupByProject(sessions).flatMap((group) => summarizeProject(srcDb, group));
    if (summaries.length === 0) throw new CompactionError("No sessions with compaction found for this scope.");
    const corpus = aggregateCompactionSummaries(summaries, "corpus", "Corpus");
    const projects = groupByProject(sessions)
      .map((group) => aggregateCompactionSummaries(summaries.filter((item) => item.projectId === group[0].project_id), group[0].project_id, group[0].slug))
      .filter((item) => item.sessions >= 30);
    writeFileSync(preparedReport.outputPath, buildReport(corpus, projects), { mode: 0o600 });
    chmodSync(preparedReport.outputPath, 0o600);
    return corpus;
  } finally {
    src?.close();
    cache?.close();
  }
}

if (import.meta.main) {
  try {
    const result = runCompactionImpact();
    console.log(`compaction sessions=${result.sessions} delta=${result.deltaRate.toFixed(4)} ci=${result.deltaLow.toFixed(4)}..${result.deltaHigh.toFixed(4)}`);
    console.log(`report=${REPORT_PATH}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
