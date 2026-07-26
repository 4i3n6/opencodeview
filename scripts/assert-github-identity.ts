/**
 * Fail-closed identity gate for OpencodeView public Git/GitHub operations.
 * Canonical owner account: 4i3n6 (https://github.com/4i3n6).
 */

export const CANONICAL_GITHUB_USER = "4i3n6";
export const CANONICAL_GIT_NAME = "4i3n6";
export const CANONICAL_GIT_EMAIL = "4i3n6@pm.me";
export const CANONICAL_REMOTE_URL = "https://github.com/4i3n6/opencodeview.git";

export type IdentitySnapshot = {
  readonly gitUserName: string;
  readonly gitUserEmail: string;
  readonly ghLogin: string | null;
  readonly remoteUrl: string | null;
};

export type IdentityCheckOptions = {
  readonly requireGh?: boolean;
  readonly requireRemote?: boolean;
};

export type IdentityCheckResult =
  | { readonly ok: true; readonly identity: IdentitySnapshot }
  | { readonly ok: false; readonly errors: readonly string[]; readonly identity: IdentitySnapshot };

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function evaluateGithubIdentity(
  input: IdentitySnapshot,
  options: IdentityCheckOptions = {},
): IdentityCheckResult {
  const requireGh = options.requireGh ?? true;
  const requireRemote = options.requireRemote ?? false;
  const errors: string[] = [];
  const gitUserName = normalize(input.gitUserName);
  const gitUserEmail = normalize(input.gitUserEmail);
  const ghLogin = input.ghLogin === null ? null : normalize(input.ghLogin);
  const remoteUrl = input.remoteUrl === null ? null : normalize(input.remoteUrl);

  if (gitUserName !== CANONICAL_GIT_NAME) {
    errors.push(
      `git user.name must be "${CANONICAL_GIT_NAME}" (got "${gitUserName || "<empty>"}")`,
    );
  }
  if (gitUserEmail !== CANONICAL_GIT_EMAIL) {
    errors.push(
      `git user.email must be "${CANONICAL_GIT_EMAIL}" (got "${gitUserEmail || "<empty>"}")`,
    );
  }
  if (requireGh && ghLogin !== CANONICAL_GITHUB_USER) {
    errors.push(
      `active gh account must be "${CANONICAL_GITHUB_USER}" (got "${ghLogin ?? "<unavailable>"}")`,
    );
  }
  if (requireRemote) {
    if (remoteUrl === null || remoteUrl.length === 0) {
      errors.push(`git remote origin must be set to ${CANONICAL_REMOTE_URL}`);
    } else if (!remoteUrlIncludesCanonicalOwner(remoteUrl)) {
      errors.push(
        `git remote origin must point at github.com/${CANONICAL_GITHUB_USER}/opencodeview (got "${remoteUrl}")`,
      );
    }
  } else if (remoteUrl !== null && remoteUrl.length > 0 && !remoteUrlIncludesCanonicalOwner(remoteUrl)) {
    errors.push(
      `git remote origin must point at github.com/${CANONICAL_GITHUB_USER}/opencodeview (got "${remoteUrl}")`,
    );
  }

  const identity: IdentitySnapshot = { gitUserName, gitUserEmail, ghLogin, remoteUrl };
  if (errors.length > 0) {
    return { ok: false, errors, identity };
  }
  return { ok: true, identity };
}

export function remoteUrlIncludesCanonicalOwner(remoteUrl: string): boolean {
  const normalized = remoteUrl.trim().toLowerCase();
  const owner = CANONICAL_GITHUB_USER.toLowerCase();
  const repo = "opencodeview";

  // https://github.com/owner/repo(.git)
  // https://owner@github.com/owner/repo(.git)
  // git@github.com:owner/repo(.git)
  const httpsWithUser = new RegExp(
    `^https://${owner}@github\\.com/${owner}/${repo}(?:\\.git)?$`,
    "u",
  );
  const httpsPlain = new RegExp(
    `^https://github\\.com/${owner}/${repo}(?:\\.git)?$`,
    "u",
  );
  const ssh = new RegExp(
    `^git@github\\.com:${owner}/${repo}(?:\\.git)?$`,
    "u",
  );

  return httpsWithUser.test(normalized) || httpsPlain.test(normalized) || ssh.test(normalized);
}

async function readGitConfig(key: string): Promise<string> {
  const proc = Bun.spawn(["git", "config", "--get", key], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    return "";
  }
  return stdout.trim();
}

async function readGhLogin(): Promise<string | null> {
  const proc = Bun.spawn(["gh", "api", "user", "--jq", ".login"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    return null;
  }
  const login = stdout.trim();
  return login.length > 0 ? login : null;
}

async function readOriginUrl(): Promise<string | null> {
  const proc = Bun.spawn(["git", "remote", "get-url", "origin"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    return null;
  }
  const url = stdout.trim();
  return url.length > 0 ? url : null;
}

export async function collectGithubIdentity(): Promise<IdentitySnapshot> {
  const [gitUserName, gitUserEmail, ghLogin, remoteUrl] = await Promise.all([
    readGitConfig("user.name"),
    readGitConfig("user.email"),
    readGhLogin(),
    readOriginUrl(),
  ]);
  return { gitUserName, gitUserEmail, ghLogin, remoteUrl };
}

export async function assertGithubIdentity(
  options: IdentityCheckOptions = {},
): Promise<IdentityCheckResult> {
  const identity = await collectGithubIdentity();
  return evaluateGithubIdentity(identity, options);
}

function parseCliOptions(argv: readonly string[]): IdentityCheckOptions {
  const requireGh = !argv.includes("--git-only");
  const requireRemote = argv.includes("--require-remote");
  return { requireGh, requireRemote };
}

if (import.meta.main) {
  const options = parseCliOptions(process.argv.slice(2));
  const result = await assertGithubIdentity(options);
  if (!result.ok) {
    console.error("OpencodeView identity gate failed:");
    for (const error of result.errors) {
      console.error(`- ${error}`);
    }
    console.error("");
    if (options.requireGh !== false) {
      console.error(`Switch with: gh auth switch --user ${CANONICAL_GITHUB_USER}`);
    }
    console.error(
      `Ensure git user is ${CANONICAL_GIT_NAME} <${CANONICAL_GIT_EMAIL}> in this repo.`,
    );
    process.exit(1);
  }

  const ghPart = result.identity.ghLogin ? ` gh=${result.identity.ghLogin}` : "";
  console.log(
    `identity ok: git=${result.identity.gitUserName} <${result.identity.gitUserEmail}>${ghPart}`,
  );
  if (result.identity.remoteUrl) {
    console.log(`remote origin: ${result.identity.remoteUrl}`);
  } else {
    console.log("remote origin: (not configured yet)");
  }
}
