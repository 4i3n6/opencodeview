import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { parseBoundedInt } from "./http-query.ts";
import { isTailscaleHost, probeTailscale, type TailscaleStatus } from "./tailscale.ts";

export type ServerConfig = {
  readonly cachePath: string;
  readonly sourcePath: string;
  readonly port: number;
  readonly hostname: string;
  readonly authToken: string | null;
  readonly logPath: string;
  /** When true, Host/Origin may be a Tailscale MagicDNS or CGNAT address. */
  readonly allowTailscaleHosts: boolean;
  readonly tailscale: TailscaleStatus | null;
};

export class ServerConfigError extends Error {
  readonly name = "ServerConfigError";
}

export function isLoopback(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  // Bun's URL.hostname keeps brackets for IPv6 literals ("[::1]").
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return bare === "127.0.0.1" || bare === "localhost" || bare === "::1";
}

export type TailscaleMode = "off" | "on" | "auto";

export function parseTailscaleMode(raw: string | undefined): TailscaleMode {
  const value = (raw ?? "off").trim().toLowerCase();
  if (value === "1" || value === "true" || value === "on" || value === "yes") return "on";
  if (value === "auto") return "auto";
  return "off";
}

export function createServerConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const mode = parseTailscaleMode(env.OPENCODEVIEW_TAILSCALE);
  const explicitHost = env.OPENCODEVIEW_HOST?.trim() || null;
  const authToken = env.OPENCODEVIEW_AUTH_TOKEN?.trim() || null;

  let tailscale: TailscaleStatus | null = null;
  let hostname = explicitHost ?? "127.0.0.1";
  let allowTailscaleHosts = false;

  if (mode !== "off") {
    tailscale = probeTailscale();
    if (mode === "on" && !tailscale.available) {
      throw new ServerConfigError(
        "OPENCODEVIEW_TAILSCALE is on but Tailscale is not available/running (install CLI and `tailscale up`).",
      );
    }
    if (tailscale.available) {
      allowTailscaleHosts = true;
      if (!explicitHost) {
        if (!tailscale.ipv4) {
          throw new ServerConfigError("Tailscale is running but no IPv4 address was reported.");
        }
        hostname = tailscale.ipv4;
      }
    }
  }

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
    allowTailscaleHosts,
    tailscale: mode === "off" ? null : tailscale,
  };
}

export function requiresAuth(config: ServerConfig): boolean {
  return !isLoopback(config.hostname);
}

export function isAllowedRequestHost(config: ServerConfig, hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (isLoopback(host)) return true;
  if (config.allowTailscaleHosts && isTailscaleHost(host)) return true;
  if (!isLoopback(config.hostname) && host === config.hostname.toLowerCase()) return true;
  return false;
}
