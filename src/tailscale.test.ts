import { describe, expect, test } from "bun:test";
import { isTailscaleHost, isTailscaleIpv4, probeTailscale, type TailscaleProbe } from "./tailscale.ts";

describe("tailscale helpers", () => {
  test("identifies Tailscale CGNAT and MagicDNS hosts", () => {
    expect(isTailscaleIpv4("100.64.1.2")).toBe(true);
    expect(isTailscaleIpv4("100.127.0.1")).toBe(true);
    expect(isTailscaleIpv4("100.63.0.1")).toBe(false);
    expect(isTailscaleIpv4("127.0.0.1")).toBe(false);
    expect(isTailscaleHost("machine.tail1234.ts.net")).toBe(true);
    expect(isTailscaleHost("100.100.50.10")).toBe(true);
    expect(isTailscaleHost("evil.example.com")).toBe(false);
  });

  test("probe returns unavailable when CLI is missing", () => {
    const probe: TailscaleProbe = {
      which: () => null,
      run: () => ({ ok: false, stdout: "", stderr: "" }),
    };
    expect(probeTailscale(probe)).toEqual({
      available: false,
      backendState: null,
      ipv4: null,
      dnsName: null,
      selfHostName: null,
    });
  });

  test("probe parses a running status payload", () => {
    const probe: TailscaleProbe = {
      which: () => "/usr/bin/tailscale",
      run: () => ({
        ok: true,
        stdout: JSON.stringify({
          BackendState: "Running",
          Self: {
            HostName: "studio",
            DNSName: "studio.tail1234.ts.net.",
            TailscaleIPs: ["fd7a:115c::1", "100.101.102.103"],
          },
        }),
        stderr: "",
      }),
    };
    expect(probeTailscale(probe)).toEqual({
      available: true,
      backendState: "Running",
      ipv4: "100.101.102.103",
      dnsName: "studio.tail1234.ts.net",
      selfHostName: "studio",
    });
  });

  test("probe treats non-running backend as unavailable", () => {
    const probe: TailscaleProbe = {
      which: () => "/usr/bin/tailscale",
      run: () => ({
        ok: true,
        stdout: JSON.stringify({ BackendState: "Stopped", Self: { TailscaleIPs: ["100.1.2.3"] } }),
        stderr: "",
      }),
    };
    expect(probeTailscale(probe).available).toBe(false);
  });
});
