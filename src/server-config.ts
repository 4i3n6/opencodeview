import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { parseBoundedInt } from "./http-query.ts";

export type ServerConfig = {
  readonly cachePath: string;
  readonly sourcePath: string;
  readonly port: number;
  readonly hostname: string;
  readonly authToken: string | null;
  readonly logPath: string;
};

export class ServerConfigError extends Error {
  readonly name = "ServerConfigError";
}

function isLoopback(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

export function createServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const hostname = env.OPENCODEVIEW_HOST ?? "127.0.0.1";
  const authToken = env.OPENCODEVIEW_AUTH_TOKEN ?? null;
  if (!isLoopback(hostname) && !authToken) {
    throw new ServerConfigError("OPENCODEVIEW_AUTH_TOKEN is required when OPENCODEVIEW_HOST is non-loopback.");
  }
  return {
    cachePath: env.OPENCODEVIEW_CACHE ?? join(import.meta.dir, "..", ".cache", "analytics.sqlite"),
    sourcePath: env.OPENCODE_DB ?? join(homedir(), ".local/share/opencode/opencode.db"),
    port: parseBoundedInt(env.PORT, { fallback: 4317, min: 1, max: 65_535 }),
    hostname,
    authToken,
    logPath: env.OH_MY_OPENCODE_LOG ?? join(tmpdir(), "oh-my-opencode.log"),
  };
}

export function requiresAuth(config: ServerConfig): boolean {
  return !isLoopback(config.hostname);
}
