import { chmodSync, lstatSync, mkdirSync, realpathSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

export class DbPathError extends Error {
  readonly name = "DbPathError";
}

export type DbPathIdentity = {
  readonly path: string;
  readonly realPath: string;
  readonly dev: number;
  readonly ino: number;
  readonly isSymbolicLink: boolean;
};

export type PrivateCachePath = {
  readonly cachePath: string;
  readonly cacheParentPath: string;
  readonly sourcePath: string;
  readonly sourceIdentity: DbPathIdentity;
  readonly cacheIdentity: DbPathIdentity | null;
  readonly cacheParentIdentity: DbPathIdentity;
};

export type PrivateCacheInput = {
  readonly cachePath: string;
  readonly sourcePath: string;
};

export type PrivateOutputPath = {
  readonly outputPath: string;
  readonly outputParentPath: string;
  readonly outputIdentity: DbPathIdentity | null;
  readonly outputParentIdentity: DbPathIdentity;
};

export type PrivateOutputInput = {
  readonly outputPath: string;
  readonly forbiddenPaths: readonly string[];
  readonly outputKind: string;
};

const PRIVATE_CACHE_ARTIFACT_SUFFIXES = ["", "-wal", "-shm"] as const;

export function inspectDbPath(path: string): DbPathIdentity | null {
  const resolved = resolve(path);
  try {
    const linkStats = lstatSync(resolved);
    const stats = statSync(resolved);
    return {
      path: resolved,
      realPath: realpathSync.native(resolved),
      dev: stats.dev,
      ino: stats.ino,
      isSymbolicLink: linkStats.isSymbolicLink(),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

export function pathsAlias(leftPath: string, rightPath: string): boolean {
  const left = inspectDbPath(leftPath);
  const right = inspectDbPath(rightPath);
  if (left === null || right === null) return resolve(leftPath) === resolve(rightPath);
  return left.realPath === right.realPath || (left.dev === right.dev && left.ino === right.ino);
}

export function assertDistinctDbPaths(sourcePath: string, cachePath: string): void {
  if (pathsAlias(sourcePath, cachePath)) throw new DbPathError("Source and cache database paths must be distinct.");
}

function assertDistinctOutputPath(outputPath: string, forbiddenPaths: readonly string[], outputKind: string): void {
  for (const forbiddenPath of forbiddenPaths) {
    if (pathsAlias(outputPath, forbiddenPath)) throw new DbPathError(`${outputKind} output path must be distinct from source and cache database paths.`);
  }
}

function ensurePrivateParentPath(parentPath: string, outputKind: string): DbPathIdentity {
  const identity = inspectDbPath(parentPath);
  if (identity !== null) {
    if (identity.isSymbolicLink) throw new DbPathError(`${outputKind} parent path must not be a symbolic link.`);
    if (!statSync(parentPath).isDirectory()) throw new DbPathError(`${outputKind} parent path must be a directory.`);
    return identity;
  }
  const ancestorPath = dirname(parentPath);
  if (ancestorPath === parentPath) throw new DbPathError(`${outputKind} parent path does not exist.`);
  ensurePrivateParentPath(ancestorPath, outputKind);
  mkdirSync(parentPath, { mode: 0o700 });
  chmodSync(parentPath, 0o700);
  const createdIdentity = inspectDbPath(parentPath);
  if (createdIdentity === null) throw new DbPathError(`${outputKind} parent path does not exist.`);
  if (createdIdentity.isSymbolicLink) throw new DbPathError(`${outputKind} parent path must not be a symbolic link.`);
  if (!statSync(parentPath).isDirectory()) throw new DbPathError(`${outputKind} parent path must be a directory.`);
  return createdIdentity;
}

export function preparePrivateOutputPath(input: PrivateOutputInput): PrivateOutputPath {
  const outputPath = resolve(input.outputPath);
  assertDistinctOutputPath(outputPath, input.forbiddenPaths, input.outputKind);
  const outputParentPath = dirname(outputPath);
  const outputParentIdentity = ensurePrivateParentPath(outputParentPath, input.outputKind);
  const outputIdentity = inspectDbPath(outputPath);
  if (outputIdentity !== null) {
    if (outputIdentity.isSymbolicLink) throw new DbPathError(`${input.outputKind} output path must not be a symbolic link.`);
    if (statSync(outputPath).isDirectory()) throw new DbPathError(`${input.outputKind} output path must be a file.`);
    assertDistinctOutputPath(outputPath, input.forbiddenPaths, input.outputKind);
  }
  return { outputPath, outputParentPath, outputIdentity, outputParentIdentity };
}

export function preparePrivateCachePath(input: PrivateCacheInput): PrivateCachePath {
  const sourcePath = resolve(input.sourcePath);
  const cachePath = resolve(input.cachePath);
  const sourceIdentity = inspectDbPath(sourcePath);
  if (sourceIdentity === null) throw new DbPathError("Source database path does not exist.");
  assertDistinctDbPaths(sourcePath, cachePath);
  const preparedCache = preparePrivateOutputPath({ outputPath: cachePath, forbiddenPaths: [sourcePath], outputKind: "Cache" });
  const cacheParentPath = preparedCache.outputParentPath;
  const cacheParentIdentity = preparedCache.outputParentIdentity;
  const cacheIdentity = preparedCache.outputIdentity;
  if (cacheIdentity !== null) {
    assertDistinctDbPaths(sourcePath, cachePath);
    chmodSync(cachePath, 0o600);
  }

  return { cachePath, cacheParentPath, sourcePath, sourceIdentity, cacheIdentity, cacheParentIdentity };
}

export function applyPrivateCacheArtifactModes(cachePath: string): void {
  const resolvedCachePath = resolve(cachePath);
  for (const suffix of PRIVATE_CACHE_ARTIFACT_SUFFIXES) {
    const artifactPath = `${resolvedCachePath}${suffix}`;
    const identity = inspectDbPath(artifactPath);
    if (identity === null) continue;
    if (identity.isSymbolicLink) throw new DbPathError("Cache artifact path must not be a symbolic link.");
    if (!statSync(artifactPath).isFile()) throw new DbPathError("Cache artifact path must be a file.");
    chmodSync(artifactPath, 0o600);
  }
}
