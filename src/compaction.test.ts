import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, linkSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  aggregateCompactionSummaries,
  computeCompactionImpact,
  runCompactionImpact,
  summarizeCompactionSession,
  wilsonDifferenceInterval,
} from "./compaction";
import type { CompactionEvent } from "./compaction";

type CompactionFixture = {
  readonly dir: string;
  readonly cachePath: string;
  readonly sourcePath: string;
  readonly reportPath: string;
};

function withCompactionFixture<T>(run: (fixture: CompactionFixture) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "opencodeview-compaction-"));
  try {
    const fixture = { dir, cachePath: join(dir, "cache.sqlite"), sourcePath: join(dir, "source.sqlite"), reportPath: join(dir, "report.md") };
    seedCompactionFixture(fixture.cachePath, fixture.sourcePath);
    return run(fixture);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function seedCompactionFixture(cachePath: string, sourcePath: string): void {
  const cache = new Database(cachePath);
  cache.exec(`
    CREATE TABLE session_metrics (
      session_id TEXT PRIMARY KEY,
      project_id TEXT,
      slug TEXT,
      compaction_count INTEGER
    );
    INSERT INTO session_metrics VALUES ('s1', 'p1', 'proj', 1);
  `);
  cache.close();

  const source = new Database(sourcePath);
  source.exec(`
    CREATE TABLE session (id TEXT PRIMARY KEY, project_id TEXT);
    CREATE TABLE message (id TEXT PRIMARY KEY, time_created INTEGER);
    CREATE TABLE part (id TEXT PRIMARY KEY, session_id TEXT, message_id TEXT, data TEXT);
    INSERT INTO session VALUES ('s1', 'p1');
    INSERT INTO message VALUES ('m1', 1), ('m2', 2), ('m3', 3), ('m4', 4);
    INSERT INTO part VALUES
      ('p1', 's1', 'm1', '{"type":"tool","state":{"status":"completed"}}'),
      ('p2', 's1', 'm2', '{"type":"tool","state":{"status":"error"}}'),
      ('p3', 's1', 'm3', '{"type":"compaction","state":{"status":"completed"}}'),
      ('p4', 's1', 'm4', '{"type":"tool","state":{"status":"error"}}');
  `);
  source.close();
}

const REPORT_ALIAS_KINDS = ["exact", "symlink", "hardlink"] as const;
const REPORT_ALIAS_TARGETS = ["source", "cache"] as const;

function expectCompactionInputsReadable(fixture: CompactionFixture): void {
  const cache = new Database(fixture.cachePath, { readonly: true });
  try {
    const row = cache.query<{ readonly n: number }, []>("SELECT COUNT(*) AS n FROM session_metrics").get();
    expect(row?.n).toBe(1);
  } finally {
    cache.close();
  }
  const source = new Database(fixture.sourcePath, { readonly: true });
  try {
    const row = source.query<{ readonly n: number }, []>("SELECT COUNT(*) AS n FROM session").get();
    expect(row?.n).toBe(1);
  } finally {
    source.close();
  }
}

describe("compaction impact math", () => {
  test("Given tools around compaction When summarizing a session Then pre and post error rates use the first compaction boundary", () => {
    // Given
    const events: CompactionEvent[] = [
      { kind: "tool", sessionId: "s1", projectId: "p1", slug: "proj", order: 1, errored: false },
      { kind: "tool", sessionId: "s1", projectId: "p1", slug: "proj", order: 2, errored: true },
      { kind: "compaction", sessionId: "s1", projectId: "p1", slug: "proj", order: 3 },
      { kind: "tool", sessionId: "s1", projectId: "p1", slug: "proj", order: 4, errored: true },
      { kind: "tool", sessionId: "s1", projectId: "p1", slug: "proj", order: 5, errored: true },
    ];

    // When
    const summary = summarizeCompactionSession({ sessionId: "s1", projectId: "p1", slug: "proj", events });

    // Then
    expect(summary.pre.tools).toBe(2);
    expect(summary.pre.errors).toBe(1);
    expect(summary.post.tools).toBe(2);
    expect(summary.post.errors).toBe(2);
    expect(summary.compactions).toBe(1);
  });

  test("Given session summaries When aggregating corpus Then Wilson difference interval is finite and positive when post errors increase", () => {
    // Given
    const summaries = [
      computeCompactionImpact({ projectId: "p1", slug: "proj", sessionId: "s1", compactions: 1, preTools: 10, preErrors: 1, postTools: 10, postErrors: 5 }),
      computeCompactionImpact({ projectId: "p1", slug: "proj", sessionId: "s2", compactions: 2, preTools: 10, preErrors: 1, postTools: 10, postErrors: 6 }),
    ];

    // When
    const aggregate = aggregateCompactionSummaries(summaries, "corpus", "Corpus");

    // Then
    expect(aggregate.sessions).toBe(2);
    expect(aggregate.deltaRate).toBeCloseTo(0.45, 6);
    expect(Number.isFinite(aggregate.deltaLow)).toBe(true);
    expect(Number.isFinite(aggregate.deltaHigh)).toBe(true);
  });

  test("Given no observations When computing Wilson difference Then the interval is neutral", () => {
    // Given
    const input = { preErrors: 0, preTools: 0, postErrors: 0, postTools: 0 };

    // When
    const interval = wilsonDifferenceInterval(input);

    // Then
    expect(interval.low).toBe(0);
    expect(interval.high).toBe(0);
  });

  test("Given source and cache paths alias When running compaction impact Then it fails before opening databases", () => {
    withCompactionFixture((fixture) => {
      expect(() => runCompactionImpact(null, fixture.cachePath, fixture.cachePath, fixture.reportPath)).toThrow(/distinct/);
    });
  });

  test("Given missing database path When running compaction impact Then the boundary error is English", () => {
    withCompactionFixture((fixture) => {
      const missingPath = join(fixture.dir, "missing-cache.sqlite");

      expect(() => runCompactionImpact(null, missingPath, fixture.sourcePath, fixture.reportPath)).toThrow(`Database not found: ${missingPath}`);
    });
  });

  test("Given read-only synthetic databases When running compaction impact Then caller parent is preserved and report file is private", () => {
    withCompactionFixture((fixture) => {
      chmodSync(fixture.dir, 0o755);
      chmodSync(fixture.cachePath, 0o400);
      chmodSync(fixture.sourcePath, 0o400);

      const corpus = runCompactionImpact(null, fixture.cachePath, fixture.sourcePath, fixture.reportPath);
      const report = readFileSync(fixture.reportPath, "utf8");

      expect(corpus.sessions).toBe(1);
      expect(corpus.compactions).toBe(1);
      expect(report).toContain("# Compaction impact on tools");
      expect(report).toContain("Read-only analysis of `opencode.db`, always scoped by `project_id` and by the list of sessions with compaction already materialized in the cache.");
      expect(report).toContain("## Direct answer");
      expect(report).toContain("- Sessions analyzed: 1");
      expect(report).toContain("- Compactions: 1");
      expect(report).toContain("- Error rate before the first compaction: 50.00% (1/2)");
      expect(report).toContain("- Error rate after any compaction: 100.00% (1/1)");
      expect(report).toContain("- Post - pre difference: 50.00%; conservative Wilson CI:");
      expect(report).toContain(" to ");
      expect(report).toContain("## When to open a new session");
      expect(report).toContain("## Projects with N >= 30 sessions");
      expect(report).toContain("| project | sessions | compactions | pre error | post error | difference | difference CI |");
      expect(report).toContain("| none | 0 | 0 | 0.00% | 0.00% | 0.00% | 0.00% to 0.00% |");
      for (const marker of ["Impacto", "compactação", "Leitura read-only", "Resposta objetiva", "Sessões", "Compactações", "Diferença", "IC Wilson conservador", "Quando vale", "Projetos", "projeto | sessões", "nenhum", "0,00%"] as const) {
        expect(report).not.toContain(marker);
      }
      expect((statSync(fixture.dir).mode & 0o777).toString(8)).toBe("755");
      expect((statSync(fixture.reportPath).mode & 0o777).toString(8)).toBe("600");
    });
  });

  test("Given new report parent When running compaction impact Then parent and report file are private", () => {
    withCompactionFixture((fixture) => {
      const reportPath = join(fixture.dir, "reports", "report.md");

      runCompactionImpact(null, fixture.cachePath, fixture.sourcePath, reportPath);

      expect((statSync(join(fixture.dir, "reports")).mode & 0o777).toString(8)).toBe("700");
      expect((statSync(reportPath).mode & 0o777).toString(8)).toBe("600");
    });
  });

  for (const targetName of REPORT_ALIAS_TARGETS) {
    for (const aliasKind of REPORT_ALIAS_KINDS) {
      test(`Given ${aliasKind} report path aliases ${targetName} database When running compaction impact Then it rejects before mutation`, () => {
        withCompactionFixture((fixture) => {
          const targetPath = targetName === "source" ? fixture.sourcePath : fixture.cachePath;
          const reportPath = aliasKind === "exact" ? targetPath : join(fixture.dir, `${targetName}-${aliasKind}-report.md`);
          if (aliasKind === "symlink") symlinkSync(targetPath, reportPath);
          if (aliasKind === "hardlink") linkSync(targetPath, reportPath);

          expect(() => runCompactionImpact(null, fixture.cachePath, fixture.sourcePath, reportPath)).toThrow(/Report output path/);
          expectCompactionInputsReadable(fixture);
        });
      });
    }
  }

  test("Given compaction opens databases When processing succeeds or fails Then every opened handle is closed", () => {
    withCompactionFixture((fixture) => {
      const originalClose = Database.prototype.close;
      let closeCalls = 0;
      Database.prototype.close = function closeWithCount(this: Database): void {
        closeCalls++;
        return originalClose.call(this);
      };
      try {
        runCompactionImpact(null, fixture.cachePath, fixture.sourcePath, fixture.reportPath);
        expect(closeCalls).toBe(2);

        closeCalls = 0;
        expect(() => runCompactionImpact("missing", fixture.cachePath, fixture.sourcePath, join(fixture.dir, "missing.md"))).toThrow("No sessions with compaction found for this scope.");
        expect(closeCalls).toBe(2);
      } finally {
        Database.prototype.close = originalClose;
      }
    });
  });
});
