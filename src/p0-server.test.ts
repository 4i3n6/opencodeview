import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];

afterEach(() => {
  delete process.env.OPENCODEVIEW_CACHE;
  delete process.env.OPENCODE_DB;
  delete process.env.OPENCODEVIEW_HOST;
  delete process.env.OPENCODEVIEW_AUTH_TOKEN;
  delete process.env.PORT;
  delete process.env.OH_MY_OPENCODE_LOG;
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function seedFixture(prefix: string): { readonly cachePath: string; readonly sourcePath: string; readonly logPath: string } {
  const dir = tempDir(prefix);
  const cachePath = join(dir, "cache.sqlite");
  const sourcePath = join(dir, "source.sqlite");
  const logPath = join(dir, "live.log");

  const cache = new Database(cachePath);
  cache.exec(`
    CREATE TABLE project (project_id TEXT PRIMARY KEY, slug TEXT, worktree TEXT, sessions INTEGER, tokens_total INTEGER, scanned_at INTEGER);
    CREATE TABLE session_metrics (
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
      dominant_model_id TEXT, dominant_provider_id TEXT, dominant_variant TEXT, spawn_depth INTEGER
    );
    CREATE TABLE session_model (session_id TEXT, project_id TEXT, slug TEXT, agent TEXT, is_subagent INTEGER, month TEXT, model_id TEXT, provider_id TEXT, variant TEXT, msgs INTEGER, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, PRIMARY KEY(session_id, model_id, provider_id, variant));
    CREATE TABLE delegation (parent_session_id TEXT, child_session_id TEXT, project_id TEXT, slug TEXT, category TEXT, requested_subagent_type TEXT, model TEXT, run_in_background INTEGER, status TEXT, duration_s REAL, title TEXT, child_adds INTEGER, child_patch_ok INTEGER, delegation_instant_fail INTEGER, delegation_zombie INTEGER, PRIMARY KEY(parent_session_id, child_session_id));
    CREATE TABLE tool_metrics (project_id TEXT, slug TEXT, tool TEXT, month TEXT, calls INTEGER, errors INTEGER, err_rate REAL, dur_p50_s REAL, dur_p95_s REAL, PRIMARY KEY(project_id, tool, month));
    CREATE TABLE tool_error_class (project_id TEXT, tool TEXT, error_class TEXT, n INTEGER, sample TEXT, PRIMARY KEY(project_id, tool, error_class));
    CREATE TABLE data_quality (month TEXT, field TEXT, n INTEGER, non_null INTEGER, coverage REAL, is_gap INTEGER, PRIMARY KEY(month, field));
    INSERT INTO project VALUES ('p1', 'proj-a', '/Users/alice/secret/project', 1, 10, 1);
    INSERT INTO session_metrics (
      session_id, project_id, slug, title, parent_id, is_subagent, agent, model,
      time_created, time_updated, tokens_input, tokens_output, tokens_reasoning,
      tokens_cache_read, tokens_cache_write, cost, summary_additions, summary_deletions, summary_files,
      tool_calls, tool_errors, tool_error_rate, patch_count, apply_patch_ok, apply_patch_err,
      compaction_count, reasoning_parts, text_parts, file_parts, msg_count, assistant_msgs, trunc_length,
      avg_latency_s, active_min, bursts, max_gap_h, flags, dominant_model_id, dominant_provider_id,
      dominant_variant, spawn_depth
    ) VALUES ('s1','p1','proj-a','title /Users/alice/secret client_secret=client-value','',0,'agent','model',1700000000,1700000000,1,2,3,0,0,0,1,0,0,1,0,0,1,1,0,0,0,1,1,1,1,0,1,1,1,0,'','model','provider','default',0);
    INSERT INTO tool_metrics VALUES ('p1','proj-a','bash','2026-01',1,0,0,1,1);
    INSERT INTO tool_metrics VALUES ('p1','proj-a','bash','2026-02',100,0,0,100,100);
    INSERT INTO tool_error_class VALUES ('p1','bash','auth',1,'Bearer sk-TESTFIXTURE01 at /Users/alice/private/file.txt apiKey=abc123');
  `);
  cache.close();

  const source = new Database(sourcePath);
  source.exec(`
    CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT);
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, title TEXT, agent TEXT, model TEXT, directory TEXT, time_created INTEGER, time_updated INTEGER, tokens_input INTEGER, tokens_output INTEGER, tokens_reasoning INTEGER, tokens_cache_read INTEGER, tokens_cache_write INTEGER, cost REAL, summary_additions INTEGER, summary_deletions INTEGER, summary_files INTEGER);
    CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT);
    CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT, message_id TEXT, time_created INTEGER, data TEXT);
    INSERT INTO project VALUES ('p1', '/Users/alice/secret/project');
    INSERT INTO session VALUES ('s1','p1',NULL,'live','agent','model','/Users/alice/secret/project',1700000000,1700000000,1,2,3,0,0,0,1,0,0);
  `);
  const liveTimestamp = Date.now() - 1_000;
  source.query("UPDATE session SET time_created = ?, time_updated = ? WHERE id = 's1'").run(
    liveTimestamp,
    liveTimestamp,
  );
  source.query("INSERT INTO message VALUES (?, ?, ?, ?)").run(
    "m1",
    "s1",
    1700000000,
    JSON.stringify({ role: "assistant", modelID: "model", providerID: "provider" }),
  );
  source.query("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run(
    "part1",
    "s1",
    "m1",
    1700000000,
    JSON.stringify({
      type: "tool",
      tool: "bash",
      state: {
        status: "error",
        title: "read /Users/alice/secret/project/.env",
        input: { apiKey: "sk-TESTFIXTURE01", url: "https://user:pass@example.com/a" },
        output: "Bearer secret-TESTFIXTURE in /Users/alice/secret/out.txt",
        error: "password=hunter2",
        time: { start: 1_700_000_000_000, end: 1_700_000_001_000 },
      },
    }),
  );
  source.query("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run(
    "part-text",
    "s1",
    "m1",
    1700000002,
    JSON.stringify({ type: "text", text: "Bearer text-TESTFIXTURE in /Users/alice/text.txt" }),
  );
  source.query("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run(
    "part-reasoning",
    "s1",
    "m1",
    1700000003,
    JSON.stringify({ type: "reasoning", text: "password=hunter2 at /home/bob/reason.txt" }),
  );
  source.query("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run(
    "part-patch",
    "s1",
    "m1",
    1700000004,
    JSON.stringify({ type: "patch", hash: "h", files: ["/Users/alice/secret/.env", "C:\\Users\\alice\\SecretFolder\\file.ts"] }),
  );
  source.query("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run(
    "part-step-finish",
    "s1",
    "m1",
    1700000005,
    JSON.stringify({ type: "step-finish", reason: "service_token=opaque-reason-TESTFIXTURE at /Users/alice/private", cost: 1, tokens: { output: 2 } }),
  );
  source.query("INSERT INTO part VALUES (?, ?, ?, ?, ?)").run(
    "part2",
    "s1",
    "m1",
    1700000001,
    JSON.stringify({
      type: "subtask",
      agent: "agent /Users/alice/secret",
      description: "client_secret=client-value",
      command: "GITHUB_TOKEN=ghs_TESTFIXTURE01 bun test",
      model: "Bearer model-TESTFIXTURE",
      prompt: "Use token ghp_TESTFIXTURE01 and inspect /Users/alice/secret",
    }),
  );
  source.close();
  writeFileSync(logPath, `[2026-07-21T12:00:00.000Z] [task] Aborting sync session {"sessionID":"s1","reason":"password=hunter2 /Users/alice/secret"}\n`);
  return { cachePath, sourcePath, logPath };
}

async function loadServer(tag: string, fixture: { readonly cachePath: string; readonly sourcePath: string; readonly logPath: string }) {
  process.env.OPENCODEVIEW_CACHE = fixture.cachePath;
  process.env.OPENCODE_DB = fixture.sourcePath;
  process.env.OH_MY_OPENCODE_LOG = fixture.logPath;
  process.env.PORT = "0";
  return import(`./server.ts?p0-${tag}-${Date.now()}`);
}

async function requestJson(server: { readonly default: { readonly fetch: (request: Request) => Response | Promise<Response> } }, path: string, token?: string, headers: HeadersInit = {}): Promise<{ readonly status: number; readonly body: unknown; readonly text: string; readonly headers: Headers }> {
  const initHeaders = new Headers(headers);
  if (token) initHeaders.set("Authorization", `Bearer ${token}`);
  const response = await server.default.fetch(new Request(`http://127.0.0.1${path}`, { headers: initHeaders }));
  const text = await response.text();
  return { status: response.status, body: JSON.parse(text), text, headers: response.headers };
}

function stepFinishReason(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("messages" in body) || !Array.isArray(body.messages)) return null;
  for (const message of body.messages) {
    if (typeof message !== "object" || message === null || !("parts" in message) || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (typeof part !== "object" || part === null || !("type" in part) || part.type !== "step-finish") continue;
      return "reason" in part && typeof part.reason === "string" ? part.reason : null;
    }
  }
  return null;
}

describe("P0 server security baseline", () => {
  test("Given default configuration When loading the server Then it binds to loopback and omits cache paths from meta", async () => {
    const fixture = seedFixture("opencodeview-p0-server-");
    const server = await loadServer("loopback", fixture);

    expect(server.default.hostname).toBe("127.0.0.1");
    const meta = await requestJson(server, "/api/meta");
    expect(meta.status).toBe(200);
    expect(meta.headers.get("Cache-Control")).toBe("no-store");
    expect(meta.text).not.toContain(fixture.cachePath);
    expect(meta.text).not.toContain("/Users/");
  });

  test("Given non-loopback configuration When token is missing or wrong Then API requests are rejected", async () => {
    const fixture = seedFixture("opencodeview-p0-auth-");
    process.env.OPENCODEVIEW_HOST = "0.0.0.0";
    process.env.OPENCODEVIEW_AUTH_TOKEN = "expected-token";
    const server = await loadServer("auth", fixture);

    expect(server.default.hostname).toBe("0.0.0.0");
    expect((await requestJson(server, "/api/meta")).status).toBe(401);
    const rejected = await requestJson(server, "/api/meta", "wrong-token");
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get("Cache-Control")).toBe("no-store");
    expect((await requestJson(server, "/api/meta", "expected-token")).status).toBe(200);
  });

  test("Given loopback mode When Host or Origin is hostile Then non-loopback browser surfaces are rejected", async () => {
    const fixture = seedFixture("opencodeview-p0-origin-");
    const server = await loadServer("origin", fixture);

    expect((await requestJson(server, "/api/meta", undefined, { Host: "localhost:4317" })).status).toBe(200);
    expect((await requestJson(server, "/api/meta", undefined, { Host: "[::1]:4317", Origin: "http://[::1]:4317" })).status).toBe(200);
    const badHost = await requestJson(server, "/api/meta", undefined, { Host: "evil.test" });
    expect(badHost.status).toBe(403);
    expect(badHost.headers.get("Cache-Control")).toBe("no-store");
    expect((await requestJson(server, "/api/meta", undefined, { Origin: "https://evil.test" })).status).toBe(403);
  });

  test("Given non-loopback configuration When auth token is absent Then loading the server fails closed", async () => {
    const fixture = seedFixture("opencodeview-p0-auth-missing-");
    process.env.OPENCODEVIEW_HOST = "0.0.0.0";
    await expect(loadServer("auth-missing", fixture)).rejects.toThrow(/OPENCODEVIEW_AUTH_TOKEN/);
  });

  test("Given cache and source paths alias When loading the server Then startup fails closed", async () => {
    const fixture = seedFixture("opencodeview-p0-alias-");
    await expect(loadServer("alias", { ...fixture, cachePath: fixture.sourcePath })).rejects.toThrow(/distinct/);
  });

  test("Given sensitive transcript and live data When requesting default APIs Then secrets and absolute paths are redacted", async () => {
    const fixture = seedFixture("opencodeview-p0-redact-");
    const server = await loadServer("redact", fixture);

    const transcript = await requestJson(server, "/api/session/s1/transcript?limit=NaN&offset=-10");
    expect(transcript.status).toBe(200);
    expect(transcript.text).toContain("[REDACTED");
    expect(stepFinishReason(transcript.body)).toContain("[REDACTED");
    expect(transcript.text).not.toContain("opaque-reason-TESTFIXTURE");
    expect(transcript.text).not.toContain("/Users/alice/private");
    expect(transcript.text).not.toContain("sk-TESTFIXTURE01");
    expect(transcript.text).not.toContain("hunter2");
    expect(transcript.text).not.toContain("text-TESTFIXTURE");
    expect(transcript.text).not.toContain("ghs_TESTFIXTURE01");
    expect(transcript.text).not.toContain("client-value");
    expect(transcript.text).not.toContain("model-TESTFIXTURE");
    expect(transcript.text).not.toContain("/Users/alice");
    expect(transcript.text).not.toContain("/home/bob");
    expect(transcript.text).not.toContain("SecretFolder");

    const session = await requestJson(server, "/api/session/s1");
    expect(session.status).toBe(200);
    expect(session.text).not.toContain("/Users/alice");
    expect(session.text).not.toContain("client-value");

    const live = await requestJson(server, "/api/live?since_min=Infinity");
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({ nodes: [{ session_id: "s1" }] });
    expect(live.text).not.toContain('"directory"');
    expect(live.text).not.toContain("/Users/alice");
    expect(live.text).not.toContain("hunter2");

    const top = await requestJson(server, "/api/orchestration/top?limit=NaN");
    expect(top.status).toBe(200);
    expect(top.text).not.toContain("/Users/alice");
    expect(top.text).not.toContain("client-value");

    const tree = await requestJson(server, "/api/orchestration/tree?session=s1");
    expect(tree.status).toBe(200);
    expect(tree.text).not.toContain("/Users/alice");
    expect(tree.text).not.toContain("client-value");
  });

  test("Given adversarial limits and monthly rollups When requesting bounded APIs Then responses are finite and duration quantile basis is honest", async () => {
    const fixture = seedFixture("opencodeview-p0-bounds-");
    const server = await loadServer("bounds", fixture);

    const sessions = await requestJson(server, "/api/projects/p1/sessions?limit=-1");
    expect(sessions.status).toBe(200);
    expect(Array.isArray(sessions.body)).toBe(true);
    expect((sessions.body as readonly unknown[]).length).toBeLessThanOrEqual(500);

    const toolErrors = await requestJson(server, "/api/tools/errors?limit=NaN");
    expect(toolErrors.status).toBe(200);
    expect(toolErrors.text).not.toMatch(/sk-TESTFIXTURE01|Bearer secret|\/Users\/alice/);

    const tools = await requestJson(server, "/api/tools");
    expect(tools.status).toBe(200);
    expect(tools.text).toContain("unavailable_monthly_rollups");
    expect(tools.text).toContain('"dur_p50_s":null');
    expect(tools.text).toContain('"dur_p95_s":null');
  });
});
