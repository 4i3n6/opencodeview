import { describe, expect, test } from "bun:test";
import { redactText, redactValue } from "./redaction.ts";

// Synthetic fixtures only. Marker TESTFIXTURE keeps values allowlisted for Gitleaks
// while still matching TOKEN_RE / secret-key redaction paths under test.
const SECRET_PATTERNS = [
  /hunter2/,
  /client-value/,
  /ghs_TESTFIXTURE01/,
  /bearer-TESTFIXTURE/i,
  /basic-TESTFIXTURE/i,
  /sk-TESTFIXTURE01/,
  /ghp_TESTFIXTURE01/,
  /github_pat_TESTFIXTURE01/,
  /glpat-TESTFIXTURE01/,
  /xoxb-_TESTFIXTURE01/,
  /AKIATESTFIXTURE00/,
  /db-pass/,
  /alice/,
  /home\/bob/,
  /Users\/carol/,
  /SecretFolder/,
  /service-TESTFIXTURE/,
  /openai-TESTFIXTURE/,
  /cloudflare-TESTFIXTURE/,
  /aws-TESTFIXTURE/,
] as const;

const NEW_OPAQUE_SECRET_VALUES = [
  "service-TESTFIXTURE",
  "openai-TESTFIXTURE",
  "cloudflare-TESTFIXTURE",
  "aws-TESTFIXTURE",
] as const;

describe("redaction", () => {
  test("Given ANSI-obfuscated credentials When redacting text Then secrets are normalized before masking", () => {
    const input = [
      "password = \u001b[31mhunter2\u001b[0m",
      "client_secret='client-value'",
      "GITHUB_TOKEN=ghs_TESTFIXTURE01",
      "authorization: bearer bearer-TESTFIXTURE",
      "Authorization: Basic basic-TESTFIXTURE",
      "sk-TESTFIXTURE01",
      "ghp_TESTFIXTURE01",
      "github_pat_TESTFIXTURE01",
      "glpat-TESTFIXTURE01",
      "xoxb-_TESTFIXTURE01",
      "AKIATESTFIXTURE00",
      "postgres://user:db-pass@localhost/app",
      "https://user:db-pass@example.test/path",
      "/Users/carol/project/.env",
      "/home/bob/project/.env",
      "C:\\Users\\alice\\SecretFolder\\.env",
    ].join("\n");

    const redacted = redactText(input);

    expect(redacted).toContain("[REDACTED]");
    expect(redacted).not.toContain("\u001b");
    for (const pattern of SECRET_PATTERNS) expect(redacted).not.toMatch(pattern);
  });

  test("Given nested sensitive values When redacting value Then string leaves and secret keys are masked", () => {
    const redacted = redactValue({
      ok: "visible",
      password: "hunter2",
      ["api\u001b[31mKey".replace("\\u001b", "\u001b")]: "plain-secret-value",
      nested: { token: "github_pat_TESTFIXTURE01", note: "Bearer bearer-TESTFIXTURE" },
      paths: ["/Users/carol/project", "C:\\Users\\alice\\SecretFolder"],
    });

    expect(JSON.stringify(redacted)).toBe(
      JSON.stringify({
        ok: "visible",
        password: "[REDACTED]",
        ["api\u001b[31mKey".replace("\\u001b", "\u001b")]: "[REDACTED]",
        nested: { token: "[REDACTED]", note: "Bearer [REDACTED]" },
        paths: ["/[REDACTED]", "[REDACTED]"],
      }),
    );
  });

  test("Given prefixed and suffixed secret key names When redacting text Then quoted and unquoted values are masked", () => {
    const input = [
      'service_token="service-TESTFIXTURE"',
      '"OPENAI_API_KEY": "openai-TESTFIXTURE"',
      "CLOUDFLARE_API_TOKEN='cloudflare-TESTFIXTURE'",
      "'AWS_SECRET_ACCESS_KEY':'aws-TESTFIXTURE'",
    ].join("\n");

    const redacted = redactText(input);

    for (const secret of NEW_OPAQUE_SECRET_VALUES) expect(redacted).not.toContain(secret);
    expect(redacted).toContain("[REDACTED]");
    for (const pattern of SECRET_PATTERNS) expect(redacted).not.toMatch(pattern);
  });

  test("Given nested prefixed and suffixed secret key names When redacting value Then values are masked at every depth", () => {
    const redacted = redactValue({
      service_token: "service-TESTFIXTURE",
      nested: {
        OPENAI_API_KEY: "openai-TESTFIXTURE",
        provider: { CLOUDFLARE_API_TOKEN: "cloudflare-TESTFIXTURE", AWS_SECRET_ACCESS_KEY: "aws-TESTFIXTURE" },
      },
      text: 'service_token="service-TESTFIXTURE" OPENAI_API_KEY="openai-TESTFIXTURE"',
    });
    const serialized = JSON.stringify(redacted);

    for (const secret of NEW_OPAQUE_SECRET_VALUES) expect(serialized).not.toContain(secret);
    expect(serialized).toContain("[REDACTED]");
    for (const pattern of SECRET_PATTERNS) expect(serialized).not.toMatch(pattern);
  });
});
