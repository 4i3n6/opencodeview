import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const WAVE2_TIME_CREATED = Date.UTC(2026, 0, 1);

const PROJECT_SCOPED_CACHE_TABLES = [
  "project",
  "session_metrics",
  "session_model",
  "delegation",
  "tool_metrics",
  "tool_error_class",
  "tool_duration_sample",
] as const;

type ProjectScopedCacheTable = (typeof PROJECT_SCOPED_CACHE_TABLES)[number];

function createSource(path: string, sessionIds: readonly string[]): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, slug TEXT, title TEXT, agent TEXT, model TEXT, time_created INTEGER, time_updated INTEGER, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, cost REAL, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER);
    CREATE INDEX session_project_idx ON session(project_id);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
    CREATE INDEX message_session_idx ON message(session_id);
    CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT, message_id TEXT, time_created INTEGER, data TEXT);
    CREATE INDEX part_session_idx ON part(session_id);
    INSERT INTO project VALUES ('p1', '/tmp/project-one');
    INSERT INTO project VALUES ('p2', '/tmp/project-two');
  `);
  const insertSession = db.prepare("INSERT INTO session VALUES (?, ?, NULL, NULL, ?, 'agent', 'model', ?, ?, 1, 2, 3, 0, 0, 0, 1, 0, 0)");
  const insertMessage = db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)");
  const insertPart = db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?)");
  for (const id of sessionIds) {
    insertSession.run(id, "p1", `title-${id}`, 1700000000, 1700000000);
    insertMessage.run(`m-${id}`, id, 1700000000, JSON.stringify({ role: "assistant", modelID: "model", providerID: "provider", tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 0, write: 0 } } }));
    insertPart.run(`tool-${id}`, id, `m-${id}`, 1700000000, JSON.stringify({ type: "tool", tool: "bash", state: { status: "completed", time: { start: 0, end: 1000 } } }));
  }
  insertSession.run("other", "p2", "other", 1700000000, 1700000000);
  insertMessage.run("m-other", "other", 1700000000, JSON.stringify({ role: "assistant", modelID: "model", providerID: "provider", tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 0, write: 0 } } }));
  db.close();
}

function createWave2Source(path: string, projectIds: readonly string[]): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, slug TEXT, title TEXT, agent TEXT, model TEXT, time_created INTEGER, time_updated INTEGER, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, cost REAL, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER);
    CREATE INDEX session_project_idx ON session(project_id);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
    CREATE INDEX message_session_idx ON message(session_id);
    CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT, message_id TEXT, time_created INTEGER, data TEXT);
    CREATE INDEX part_session_idx ON part(session_id);
  `);
  const insertProject = db.prepare("INSERT INTO project VALUES (?, ?)");
  const insertSession = db.prepare("INSERT INTO session VALUES (?, ?, ?, NULL, ?, 'agent', 'model', ?, ?, 1, 2, 3, 0, 0, 0, 0, 0, 0)");
  const insertMessage = db.prepare("INSERT INTO message VALUES (?, ?, ?, ?)");
  const insertPart = db.prepare("INSERT INTO part VALUES (?, ?, ?, ?, ?)");
  for (const projectId of projectIds) {
    const parentSessionId = `${projectId}-parent`;
    const childSessionId = `${projectId}-child`;
    insertProject.run(projectId, `/tmp/project-${projectId}`);
    insertSession.run(parentSessionId, projectId, null, `parent-${projectId}`, WAVE2_TIME_CREATED, WAVE2_TIME_CREATED);
    insertSession.run(childSessionId, projectId, parentSessionId, `child-${projectId}`, WAVE2_TIME_CREATED, WAVE2_TIME_CREATED);
    for (const sessionId of [parentSessionId, childSessionId]) {
      insertMessage.run(
        `m-${sessionId}`,
        sessionId,
        WAVE2_TIME_CREATED,
        JSON.stringify({ role: "assistant", modelID: "model", providerID: "provider", variant: "default", time: { created: WAVE2_TIME_CREATED, completed: WAVE2_TIME_CREATED + 1000 }, tokens: { input: 1, output: 2, reasoning: 3, cache: { read: 0, write: 0 } } }),
      );
    }
    insertPart.run(
      `task-${projectId}`,
      parentSessionId,
      `m-${parentSessionId}`,
      WAVE2_TIME_CREATED,
      JSON.stringify({ type: "tool", tool: "task", state: { status: "completed", metadata: { sessionId: childSessionId, category: "deep", model: { modelID: "model" }, run_in_background: true }, input: { subagent_type: "explore" }, time: { start: 0, end: 1000 }, title: "child" } }),
    );
    insertPart.run(
      `error-${projectId}`,
      childSessionId,
      `m-${childSessionId}`,
      WAVE2_TIME_CREATED,
      JSON.stringify({ type: "tool", tool: "bash", state: { status: "error", error: "Bearer sk-TESTFIXTURE0123456 at /Users/alice/private.txt api_key=abc123", time: { start: 0, end: 1500 } } }),
    );
  }
  db.close();
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function modeOf(path: string): number {
  return statSync(path).mode & 0o777;
}

function countProjectRows(db: Database, table: ProjectScopedCacheTable, projectId: string): number {
  const row = db.query<{ readonly n: number }, [string]>(`SELECT COUNT(*) AS n FROM ${table} WHERE project_id = ?`).get(projectId);
  return row?.n ?? 0;
}

function runScan(sourcePath: string, cachePath: string, args: readonly string[] = ["p1"]): { readonly stdout: string; readonly stderr: string; readonly exitCode: number | null } {
  const result = Bun.spawnSync({
    cmd: ["bun", "src/scan.ts", ...args],
    cwd: import.meta.dir.replace(/\/src$/, ""),
    env: { ...process.env, OPENCODE_DB: sourcePath, OPENCODEVIEW_CACHE: cachePath },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { stdout: result.stdout.toString(), stderr: result.stderr.toString(), exitCode: result.exitCode };
}

describe("P0 scanner cache convergence", () => {
  test("Given configured cache path When scanning Then the configured parent is created and source stays unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-scan-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      const cachePath = join(dir, "nested", "cache.sqlite");
      createSource(sourcePath, ["s1", "s2"]);
      const before = statSync(sourcePath);

      const result = runScan(sourcePath, cachePath);

      expect(result.exitCode).toBe(0);
      expect(existsSync(cachePath)).toBe(true);
      const after = statSync(sourcePath);
      expect(after.size).toBe(before.size);
      expect(after.mtimeMs).toBe(before.mtimeMs);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Given a project loses source sessions When rescanning Then stale materialized rows are removed and other projects remain", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-converge-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      const cachePath = join(dir, "cache.sqlite");
      createSource(sourcePath, ["s1", "s2"]);
      expect(runScan(sourcePath, cachePath).exitCode).toBe(0);

      const cache = new Database(cachePath);
      cache.query("INSERT OR REPLACE INTO session_metrics (session_id, project_id, slug) VALUES ('stale-other', 'p2', 'project-two')").run();
      cache.close();

      rmSync(sourcePath, { force: true });
      createSource(sourcePath, []);
      expect(runScan(sourcePath, cachePath).exitCode).toBe(0);

      const next = new Database(cachePath, { readonly: true });
      const p1Sessions = next.query("SELECT COUNT(*) AS n FROM session_metrics WHERE project_id = 'p1'").get() as { readonly n: number };
      const p1Summary = next.query("SELECT sessions FROM project WHERE project_id = 'p1'").get() as { readonly sessions: number } | null;
      const p2Sessions = next.query("SELECT COUNT(*) AS n FROM session_metrics WHERE project_id = 'p2'").get() as { readonly n: number };
      next.close();

      expect(p1Sessions.n).toBe(0);
      expect(p1Summary).toBeNull();
      expect(p2Sessions.n).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Given source and cache aliases When scanning Then the scanner rejects the cache path and source stays unchanged", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-alias-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      createWave2Source(sourcePath, ["p1"]);
      const before = statSync(sourcePath);
      const beforeDigest = sha256File(sourcePath);

      const result = runScan(sourcePath, sourcePath, ["--all"]);

      expect(result.exitCode).not.toBe(0);
      const after = statSync(sourcePath);
      expect(sha256File(sourcePath)).toBe(beforeDigest);
      expect(after.mtimeMs).toBe(before.mtimeMs);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Given all scan creates SQLite cache artifacts When scanning Then cache parent and artifacts are private", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-modes-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      const cachePath = join(dir, "cache", "analytics.sqlite");
      createWave2Source(sourcePath, ["p1"]);

      const result = runScan(sourcePath, cachePath, ["--all"]);

      expect(result.exitCode).toBe(0);
      expect([result.stdout.includes("flags (all sessions):"), result.stdout.includes("todas sessões")]).toEqual([true, false]);
      expect(modeOf(dirname(cachePath))).toBe(0o700);
      for (const artifactPath of [cachePath, `${cachePath}-wal`, `${cachePath}-shm`]) {
        expect(existsSync(artifactPath)).toBe(true);
        expect(modeOf(artifactPath)).toBe(0o600);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Given caller-owned cache parent When scanning Then parent mode is preserved and artifacts are private", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-existing-cache-parent-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      const cacheParent = join(dir, "caller-cache");
      const cachePath = join(cacheParent, "analytics.sqlite");
      createWave2Source(sourcePath, ["p1"]);
      mkdirSync(cacheParent);
      chmodSync(cacheParent, 0o755);

      const result = runScan(sourcePath, cachePath, ["--all"]);

      expect(result.exitCode).toBe(0);
      expect(modeOf(cacheParent)).toBe(0o755);
      for (const artifactPath of [cachePath, `${cachePath}-wal`, `${cachePath}-shm`]) {
        expect(existsSync(artifactPath)).toBe(true);
        expect(modeOf(artifactPath)).toBe(0o600);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Given symlinked cache parent When scanning Then it rejects before source changes", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-symlink-cache-parent-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      const realParent = join(dir, "real-cache");
      const linkedParent = join(dir, "linked-cache");
      const cachePath = join(linkedParent, "analytics.sqlite");
      createWave2Source(sourcePath, ["p1"]);
      mkdirSync(realParent);
      chmodSync(realParent, 0o755);
      symlinkSync(realParent, linkedParent, "dir");
      const before = statSync(sourcePath);
      const beforeDigest = sha256File(sourcePath);

      const result = runScan(sourcePath, cachePath, ["--all"]);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("symbolic link");
      const after = statSync(sourcePath);
      expect(sha256File(sourcePath)).toBe(beforeDigest);
      expect(after.mtimeMs).toBe(before.mtimeMs);
      expect(existsSync(cachePath)).toBe(false);
      expect(modeOf(realParent)).toBe(0o755);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Given all scan source loses a project When rescanning Then stale project-scoped rows are removed globally", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-all-converge-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      const cachePath = join(dir, "cache.sqlite");
      createWave2Source(sourcePath, ["p1", "p2"]);
      expect(runScan(sourcePath, cachePath, ["--all"]).exitCode).toBe(0);

      rmSync(sourcePath, { force: true });
      createWave2Source(sourcePath, ["p1"]);
      expect(runScan(sourcePath, cachePath, ["--all"]).exitCode).toBe(0);

      const cache = new Database(cachePath, { readonly: true });
      try {
        for (const table of PROJECT_SCOPED_CACHE_TABLES) expect(countProjectRows(cache, table, "p2")).toBe(0);
        expect(countProjectRows(cache, "session_metrics", "p1")).toBe(2);
        expect(countProjectRows(cache, "delegation", "p1")).toBe(1);
      } finally {
        cache.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Given zero-valued summary and cost fields When materializing quality Then zeros count as present", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-quality-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      const cachePath = join(dir, "cache.sqlite");
      createWave2Source(sourcePath, ["p1"]);
      expect(runScan(sourcePath, cachePath, ["--all"]).exitCode).toBe(0);

      const cache = new Database(cachePath, { readonly: true });
      try {
        const rows = cache.query<{ readonly field: string; readonly n: number; readonly non_null: number; readonly coverage: number }, []>("SELECT field, n, non_null, coverage FROM data_quality WHERE month = '2026-01' AND field IN ('summary_additions', 'cost') ORDER BY field").all();
        expect(rows).toEqual([
          { field: "cost", n: 2, non_null: 2, coverage: 1 },
          { field: "summary_additions", n: 2, non_null: 2, coverage: 1 },
        ]);
      } finally {
        cache.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("Given tool error contains secrets When scanning Then persisted tool error sample is redacted", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencodeview-p0-redacted-sample-"));
    try {
      const sourcePath = join(dir, "source.sqlite");
      const cachePath = join(dir, "cache.sqlite");
      createWave2Source(sourcePath, ["p1"]);
      expect(runScan(sourcePath, cachePath, ["--all"]).exitCode).toBe(0);

      const cache = new Database(cachePath, { readonly: true });
      try {
        const row = cache.query<{ readonly sample: string | null }, []>("SELECT sample FROM tool_error_class WHERE project_id = 'p1' AND tool = 'bash'").get();
        expect(row?.sample).toContain("[REDACTED]");
        expect(row?.sample).not.toContain("sk-TESTFIXTURE0123456");
        expect(row?.sample).not.toContain("/Users/alice");
        expect(row?.sample).not.toContain("api_key=abc123");
      } finally {
        cache.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
