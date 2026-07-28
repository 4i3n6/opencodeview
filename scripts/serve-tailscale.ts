#!/usr/bin/env bun
/**
 * Start the API (and optionally the Vite UI) with Tailscale-aware bind.
 *
 * Behavior:
 * - If Tailscale is Running: bind API to the tailnet IPv4 and require a bearer token.
 * - If Tailscale is down: fall back to loopback (same as `bun run serve`).
 *
 * Usage:
 *   bun scripts/serve-tailscale.ts           # API only
 *   bun scripts/serve-tailscale.ts --with-web
 *
 * Env:
 *   OPENCODEVIEW_AUTH_TOKEN   optional; generated into .cache if missing and TS is up
 *   OPENCODEVIEW_TAILSCALE    default "auto" for this launcher
 *   PORT / WEB_PORT           API (4317) / Vite (5273)
 */
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { probeTailscale } from "../src/tailscale.ts";

const root = join(import.meta.dir, "..");
const withWeb = process.argv.includes("--with-web");
const cacheDir = join(root, ".cache");
const tokenPath = join(cacheDir, "tailscale-auth-token");

function loadOrCreateToken(): string {
  if (process.env.OPENCODEVIEW_AUTH_TOKEN?.trim()) return process.env.OPENCODEVIEW_AUTH_TOKEN.trim();
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  if (existsSync(tokenPath)) {
    const existing = readFileSync(tokenPath, "utf8").trim();
    if (existing.length >= 16) return existing;
  }
  const token = randomBytes(24).toString("base64url");
  writeFileSync(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(tokenPath, 0o600);
  } catch {
    // best-effort on platforms without chmod
  }
  return token;
}

const ts = probeTailscale();
const env: Record<string, string> = { ...process.env } as Record<string, string>;
env.OPENCODEVIEW_TAILSCALE = env.OPENCODEVIEW_TAILSCALE ?? "auto";

if (ts.available && ts.ipv4) {
  const token = loadOrCreateToken();
  env.OPENCODEVIEW_AUTH_TOKEN = token;
  if (!env.OPENCODEVIEW_HOST) env.OPENCODEVIEW_HOST = ts.ipv4;

  console.log("Tailscale is up — binding to tailnet address (bearer auth required).");
  console.log(`  IPv4:     http://${ts.ipv4}:${env.PORT ?? "4317"}`);
  if (ts.dnsName) console.log(`  MagicDNS: http://${ts.dnsName}:${env.PORT ?? "4317"}`);
  console.log(`  Auth:     Authorization: Bearer <token>`);
  console.log(`  Token:    stored at .cache/tailscale-auth-token (gitignored)`);
  console.log("");
  console.log("Browser UI: set localStorage opencodeview_auth_token to the token, or");
  console.log("  VITE_OPENCODEVIEW_AUTH_TOKEN=<token> bun run web:tailscale");
  console.log("");
} else {
  console.log("Tailscale not available/running — starting on loopback only.");
  console.log("  Install Tailscale and run `tailscale up`, then relaunch.");
  console.log("");
}

const children: Array<ReturnType<typeof Bun.spawn>> = [];

function spawnLogged(label: string, cmd: string[], childEnv: Record<string, string>) {
  const child = Bun.spawn(cmd, {
    cwd: root,
    env: childEnv,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  children.push(child);
  child.exited.then((code) => {
    if (code !== 0) console.error(`[${label}] exited with code ${code}`);
  });
  return child;
}

const api = spawnLogged("api", ["bun", "src/server.ts"], env);

if (withWeb) {
  const webEnv = { ...env };
  // Vite must listen on the same non-loopback host when TS is up.
  if (ts.available && ts.ipv4) {
    webEnv.VITE_HOST = ts.ipv4;
    webEnv.VITE_OPENCODEVIEW_AUTH_TOKEN = env.OPENCODEVIEW_AUTH_TOKEN ?? "";
    webEnv.VITE_API_PROXY = `http://${ts.ipv4}:${env.PORT ?? "4317"}`;
  }
  spawnLogged("web", ["bun", "run", "dev", "--", "--host", webEnv.VITE_HOST ?? "127.0.0.1"], {
    ...webEnv,
    // run from web/
  });
  // spawn from web directory
  children.pop();
  const web = Bun.spawn(["bun", "run", "dev", "--", "--host", webEnv.VITE_HOST ?? "127.0.0.1"], {
    cwd: join(root, "web"),
    env: webEnv,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  children.push(web);
}

function shutdown(signal: string) {
  console.log(`\nShutting down (${signal})...`);
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const code = await api.exited;
for (const child of children) {
  if (child !== api) {
    try {
      child.kill();
    } catch {
      // ignore
    }
  }
}
process.exit(code ?? 1);
