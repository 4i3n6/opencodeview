import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DbPathError,
  assertDistinctDbPaths,
  inspectDbPath,
  pathsAlias,
  preparePrivateCachePath,
} from "./db-paths.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = join(tmpdir(), `opencodeview-db-paths-${crypto.randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  dirs.push(dir);
  return dir;
}

describe("db path safety helpers", () => {
  test("Given existing and missing paths When inspecting identity Then canonical and missing states are explicit", () => {
    const dir = tempDir();
    const existing = join(dir, "source.sqlite");
    const missing = join(dir, "cache.sqlite");
    writeFileSync(existing, "sqlite");

    const identity = inspectDbPath(existing);

    expect(identity).toMatchObject({ path: existing, isSymbolicLink: false });
    expect(identity?.realPath).toBe(realpathSync.native(existing));
    expect(identity?.dev).toBeGreaterThan(0);
    expect(identity?.ino).toBeGreaterThan(0);
    expect(inspectDbPath(missing)).toBeNull();
  });

  test("Given canonical, symlink, and inode aliases When comparing paths Then aliases are rejected", () => {
    const dir = tempDir();
    const source = join(dir, "source.sqlite");
    const symlink = join(dir, "source-link.sqlite");
    const hardlink = join(dir, "source-hard.sqlite");
    writeFileSync(source, "sqlite");
    symlinkSync(source, symlink);
    Bun.spawnSync(["ln", source, hardlink]);

    expect(pathsAlias(source, source)).toBe(true);
    expect(pathsAlias(source, symlink)).toBe(true);
    expect(pathsAlias(source, hardlink)).toBe(true);
    expect(() => assertDistinctDbPaths(source, symlink)).toThrow(DbPathError);
    expect(() => assertDistinctDbPaths(source, hardlink)).toThrow(DbPathError);
  });

  test("Given private cache target When preparing path Then parent and file permissions are enforced without opening SQLite", () => {
    const dir = tempDir();
    const source = join(dir, "source.sqlite");
    const cache = join(dir, "private", "cache.sqlite");
    writeFileSync(source, "sqlite");

    const prepared = preparePrivateCachePath({ sourcePath: source, cachePath: cache });

    expect(prepared.sourceIdentity.realPath).toBe(realpathSync.native(source));
    expect(prepared.cacheIdentity).toBeNull();
    expect(prepared.cacheParentPath).toBe(join(dir, "private"));
    expect(statSync(prepared.cacheParentPath).mode & 0o777).toBe(0o700);
    expect(() => preparePrivateCachePath({ sourcePath: source, cachePath: source })).toThrow(DbPathError);
  });

  test("Given caller-owned cache parent When preparing path Then parent mode is preserved and cache file is private", () => {
    const dir = tempDir();
    const source = join(dir, "source.sqlite");
    const cacheParent = join(dir, "caller-cache");
    const cache = join(cacheParent, "cache.sqlite");
    writeFileSync(source, "sqlite");
    mkdirSync(cacheParent);
    chmodSync(cacheParent, 0o755);
    writeFileSync(cache, "cache");
    chmodSync(cache, 0o644);

    preparePrivateCachePath({ sourcePath: source, cachePath: cache });

    expect((statSync(cacheParent).mode & 0o777).toString(8)).toBe("755");
    expect((statSync(cache).mode & 0o777).toString(8)).toBe("600");
  });

  test("Given cache parent is a symlink When preparing path Then the parent is rejected", () => {
    const dir = tempDir();
    const source = join(dir, "source.sqlite");
    const realParent = join(dir, "real-cache");
    const linkedParent = join(dir, "linked-cache");
    writeFileSync(source, "sqlite");
    mkdirSync(realParent);
    symlinkSync(realParent, linkedParent, "dir");

    expect(() => preparePrivateCachePath({ sourcePath: source, cachePath: join(linkedParent, "cache.sqlite") })).toThrow(DbPathError);
  });

  test("Given cache target is a symlink When preparing path Then the cache target is rejected", () => {
    const dir = tempDir();
    const source = join(dir, "source.sqlite");
    const target = join(dir, "target.sqlite");
    const cacheSymlink = join(dir, "cache-link.sqlite");
    writeFileSync(source, "source");
    writeFileSync(target, "cache");
    symlinkSync(target, cacheSymlink);

    expect(() => preparePrivateCachePath({ sourcePath: source, cachePath: cacheSymlink })).toThrow(DbPathError);
  });
});
