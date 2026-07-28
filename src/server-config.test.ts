import { describe, expect, test } from "bun:test";
import { createServerConfig, isAllowedRequestHost, parseTailscaleMode, ServerConfigError } from "./server-config.ts";

describe("server-config", () => {
  test("defaults to loopback without auth", () => {
    const config = createServerConfig({
      OPENCODEVIEW_HOST: undefined,
      OPENCODEVIEW_AUTH_TOKEN: undefined,
      OPENCODEVIEW_TAILSCALE: undefined,
      OPENCODEVIEW_CACHE: "/tmp/cache.sqlite",
      OPENCODE_DB: "/tmp/source.sqlite",
    });
    expect(config.hostname).toBe("127.0.0.1");
    expect(config.authToken).toBeNull();
    expect(config.allowTailscaleHosts).toBe(false);
  });

  test("rejects non-loopback without token", () => {
    expect(() =>
      createServerConfig({
        OPENCODEVIEW_HOST: "0.0.0.0",
        OPENCODEVIEW_AUTH_TOKEN: undefined,
        OPENCODEVIEW_CACHE: "/tmp/cache.sqlite",
        OPENCODE_DB: "/tmp/source.sqlite",
      }),
    ).toThrow(ServerConfigError);
  });

  test("allows non-loopback with token", () => {
    const config = createServerConfig({
      OPENCODEVIEW_HOST: "100.64.1.2",
      OPENCODEVIEW_AUTH_TOKEN: "test-token-value",
      OPENCODEVIEW_CACHE: "/tmp/cache.sqlite",
      OPENCODE_DB: "/tmp/source.sqlite",
    });
    expect(config.hostname).toBe("100.64.1.2");
    expect(isAllowedRequestHost(config, "100.64.1.2")).toBe(true);
    expect(isAllowedRequestHost(config, "evil.example")).toBe(false);
  });

  test("parseTailscaleMode accepts auto/on/off", () => {
    expect(parseTailscaleMode(undefined)).toBe("off");
    expect(parseTailscaleMode("auto")).toBe("auto");
    expect(parseTailscaleMode("1")).toBe("on");
    expect(parseTailscaleMode("off")).toBe("off");
  });
});
