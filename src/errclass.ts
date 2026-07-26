export const ERROR_CLASSES = [
  "file_not_found",
  "patch_mismatch",
  "file_modified",
  "http_4xx_5xx",
  "mcp_transport",
  "exit_nonzero",
  "aborted",
  "not_found_tool",
  "other",
] as const;

export type ErrorClass = (typeof ERROR_CLASSES)[number];

const CLASSIFIERS: readonly { readonly klass: Exclude<ErrorClass, "other">; readonly pattern: RegExp }[] = [
  { klass: "file_not_found", pattern: /File not found/ },
  { klass: "patch_mismatch", pattern: /apply_patch verification failed|Failed to find expected/ },
  { klass: "file_modified", pattern: /has been modified since/ },
  { klass: "http_4xx_5xx", pattern: /status code: \d{3}/ },
  { klass: "mcp_transport", pattern: /Streamable HTTP error|POSTing to endpoint/ },
  { klass: "exit_nonzero", pattern: /exit code/ },
  { klass: "aborted", pattern: /execution aborted|dismissed/ },
  { klass: "not_found_tool", pattern: /Skill or command .* not found/ },
] as const;

export function classify(error: string): ErrorClass {
  for (const classifier of CLASSIFIERS) {
    if (classifier.pattern.test(error)) return classifier.klass;
  }
  return "other";
}
