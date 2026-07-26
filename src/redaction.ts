const REDACTED = "[REDACTED]";

const SECRET_KEY_NAME_RE = /(?:^|[_-])(?:api[_-]?key|api[_-]?token|access[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|github[_-]?token|client[_-]?secret|secret(?:[_-]?access[_-]?key)?|password|passwd|pwd|bearer|token)$/i;
const SECRET_KEY_RE = /(["']?)([A-Za-z0-9_-]*(?:api[_-]?key|api[_-]?token|access[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|github[_-]?token|client[_-]?secret|secret(?:[_-]?access[_-]?key)?|password|passwd|pwd|bearer|token))\1\s*([:=])\s*("[^"]*"|'[^']*'|[^\s,;"'}\])]+)/gi;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BASIC_AUTH_RE = /\bAuthorization\s*:\s*Basic\s+[A-Za-z0-9._~+/=-]+/gi;
const TOKEN_RE = /\b(?:sk-[A-Za-z0-9_-]{6,}|ghp_[A-Za-z0-9_]{6,}|github_pat_[A-Za-z0-9_]{6,}|glpat-[A-Za-z0-9_-]{6,}|xox[baprs]-[A-Za-z0-9_-]{6,}|AKIA[A-Z0-9]{12,})\b/g;
const URL_USERINFO_RE = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const UNIX_HOME_PATH_RE = /\/(?:Users|home)\/[^\s"'`,;)}\]]+/g;
const WINDOWS_USER_PATH_RE = /\b[A-Za-z]:\\Users\\[^\s"'`,;)}\]]+/g;
const ANSI_RE = new RegExp(String.raw`\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))`, "g");
const CONTROL_RE = new RegExp(String.raw`[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]`, "g");

function normalizeSensitiveText(input: string): string {
  return input.replace(ANSI_RE, "").replace(CONTROL_RE, "");
}

export function redactText(input: string): string {
  return normalizeSensitiveText(input)
    .replace(URL_USERINFO_RE, "$1[REDACTED]@")
    .replace(BASIC_AUTH_RE, "Authorization: Basic [REDACTED]")
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(TOKEN_RE, REDACTED)
    .replace(SECRET_KEY_RE, (_match, keyQuote: string, key: string, separator: string, value: string) => {
      const quote = value.startsWith("'") ? "'" : value.startsWith('"') ? '"' : "";
      return `${keyQuote}${key}${keyQuote}${separator}${quote}${REDACTED}${quote}`;
    })
    .replace(WINDOWS_USER_PATH_RE, REDACTED)
    .replace(UNIX_HOME_PATH_RE, "/[REDACTED]");
}

export function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || value === undefined) return value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = SECRET_KEY_NAME_RE.test(normalizeSensitiveText(key)) ? REDACTED : redactValue(item);
    }
    return out;
  }
  return null;
}

export function omitAbsolutePath(value: string | null): string | null {
  if (value === null) return null;
  return value.startsWith("/Users/") || value.startsWith("/home/") || /^[A-Za-z]:\\Users\\/.test(value) ? null : value;
}
