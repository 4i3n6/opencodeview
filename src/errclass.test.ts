import { describe, expect, test } from "bun:test";
import { classify, type ErrorClass } from "./errclass.ts";

describe("classify", () => {
  const cases: Array<[string, ErrorClass]> = [
    ["File not found: /tmp/missing.txt", "file_not_found"],
    ["apply_patch verification failed: Error: Failed to find expected", "patch_mismatch"],
    ["Failed to find expected lines in file", "patch_mismatch"],
    ["File has been modified since it was read", "file_modified"],
    ["request failed with status code: 503", "http_4xx_5xx"],
    ["Streamable HTTP error while POSTing to endpoint", "mcp_transport"],
    ["process returned exit code 2", "exit_nonzero"],
    ["execution aborted by user", "aborted"],
    ["dialog dismissed", "aborted"],
    ["Skill or command deploy-cloudflare not found", "not_found_tool"],
    ["something else entirely", "other"],
  ];

  for (const [input, expected] of cases) {
    test(`${expected}: ${input}`, () => {
      expect(classify(input)).toBe(expected);
    });
  }
});
