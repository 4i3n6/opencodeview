/**
 * Optional Tailscale integration for tailnet-only remote access.
 * Detection is best-effort and never phones home; it only shells out to the
 * local `tailscale` CLI when present.
 */

export type TailscaleStatus = {
  readonly available: boolean;
  readonly backendState: string | null;
  readonly ipv4: string | null;
  readonly dnsName: string | null;
  readonly selfHostName: string | null;
};

export type TailscaleProbe = {
  readonly which: (bin: string) => string | null;
  readonly run: (argv: readonly string[]) => { readonly ok: boolean; readonly stdout: string; readonly stderr: string };
};

const DEFAULT_PROBE: TailscaleProbe = {
  which(bin) {
    const result = Bun.spawnSync(["/usr/bin/env", "bash", "-lc", `command -v ${bin}`], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) return null;
    const path = result.stdout.toString().trim();
    return path.length > 0 ? path : null;
  },
  run(argv) {
    const result = Bun.spawnSync([...argv], { stdout: "pipe", stderr: "pipe" });
    return {
      ok: result.exitCode === 0,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  },
};

function firstIpv4(status: unknown): string | null {
  if (typeof status !== "object" || status === null) return null;
  const self = (status as { Self?: unknown }).Self;
  if (typeof self !== "object" || self === null) return null;
  const addrs = (self as { TailscaleIPs?: unknown }).TailscaleIPs;
  if (!Array.isArray(addrs)) return null;
  for (const addr of addrs) {
    if (typeof addr === "string" && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(addr)) return addr;
  }
  return null;
}

function dnsNameOf(status: unknown): string | null {
  if (typeof status !== "object" || status === null) return null;
  const self = (status as { Self?: unknown }).Self;
  if (typeof self !== "object" || self === null) return null;
  const dns = (self as { DNSName?: unknown }).DNSName;
  if (typeof dns !== "string" || dns.length === 0) return null;
  return dns.endsWith(".") ? dns.slice(0, -1) : dns;
}

function hostNameOf(status: unknown): string | null {
  if (typeof status !== "object" || status === null) return null;
  const self = (status as { Self?: unknown }).Self;
  if (typeof self !== "object" || self === null) return null;
  const host = (self as { HostName?: unknown }).HostName;
  return typeof host === "string" && host.length > 0 ? host : null;
}

export function isTailscaleIpv4(hostname: string): boolean {
  // CGNAT 100.64.0.0/10 used by Tailscale.
  const m = /^100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname.trim());
  if (!m) return false;
  const a = Number(m[1]);
  return a >= 64 && a <= 127;
}

export function isTailscaleHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (isTailscaleIpv4(host)) return true;
  if (host.endsWith(".ts.net")) return true;
  return false;
}

export function probeTailscale(probe: TailscaleProbe = DEFAULT_PROBE): TailscaleStatus {
  const bin = probe.which("tailscale");
  if (!bin) {
    return { available: false, backendState: null, ipv4: null, dnsName: null, selfHostName: null };
  }
  const statusRun = probe.run([bin, "status", "--json"]);
  if (!statusRun.ok) {
    return { available: false, backendState: null, ipv4: null, dnsName: null, selfHostName: null };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(statusRun.stdout);
  } catch {
    return { available: false, backendState: null, ipv4: null, dnsName: null, selfHostName: null };
  }
  const backendState =
    typeof parsed === "object" && parsed !== null && typeof (parsed as { BackendState?: unknown }).BackendState === "string"
      ? ((parsed as { BackendState: string }).BackendState)
      : null;
  const running = backendState === "Running";
  if (!running) {
    return { available: false, backendState, ipv4: null, dnsName: null, selfHostName: null };
  }
  return {
    available: true,
    backendState,
    ipv4: firstIpv4(parsed),
    dnsName: dnsNameOf(parsed),
    selfHostName: hostNameOf(parsed),
  };
}
