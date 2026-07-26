import { describe, expect, test } from "bun:test";
import {
  CANONICAL_GIT_EMAIL,
  CANONICAL_GIT_NAME,
  CANONICAL_GITHUB_USER,
  CANONICAL_REMOTE_URL,
  evaluateGithubIdentity,
  remoteUrlIncludesCanonicalOwner,
} from "./assert-github-identity.ts";

describe("evaluateGithubIdentity", () => {
  test("passes for the canonical 4i3n6 identity without a remote", () => {
    const result = evaluateGithubIdentity({
      gitUserName: CANONICAL_GIT_NAME,
      gitUserEmail: CANONICAL_GIT_EMAIL,
      ghLogin: CANONICAL_GITHUB_USER,
      remoteUrl: null,
    });

    expect(result.ok).toBe(true);
  });

  test("passes when origin matches the canonical HTTPS remote", () => {
    const result = evaluateGithubIdentity({
      gitUserName: CANONICAL_GIT_NAME,
      gitUserEmail: CANONICAL_GIT_EMAIL,
      ghLogin: CANONICAL_GITHUB_USER,
      remoteUrl: CANONICAL_REMOTE_URL,
    });

    expect(result.ok).toBe(true);
  });

  test("fails when git author is a personal account", () => {
    const result = evaluateGithubIdentity({
      gitUserName: "other-dev",
      gitUserEmail: "other-dev@example.com",
      ghLogin: CANONICAL_GITHUB_USER,
      remoteUrl: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("user.name"))).toBe(true);
      expect(result.errors.some((error) => error.includes("user.email"))).toBe(true);
    }
  });

  test("fails when the active gh account is not 4i3n6", () => {
    const result = evaluateGithubIdentity({
      gitUserName: CANONICAL_GIT_NAME,
      gitUserEmail: CANONICAL_GIT_EMAIL,
      ghLogin: "other-user",
      remoteUrl: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("active gh account"))).toBe(true);
    }
  });

  test("allows non-canonical gh account in git-only mode", () => {
    const result = evaluateGithubIdentity(
      {
        gitUserName: CANONICAL_GIT_NAME,
        gitUserEmail: CANONICAL_GIT_EMAIL,
        ghLogin: "other-user",
        remoteUrl: null,
      },
      { requireGh: false },
    );

    expect(result.ok).toBe(true);
  });

  test("fails when origin points at another owner", () => {
    const result = evaluateGithubIdentity({
      gitUserName: CANONICAL_GIT_NAME,
      gitUserEmail: CANONICAL_GIT_EMAIL,
      ghLogin: CANONICAL_GITHUB_USER,
      remoteUrl: "https://github.com/other-owner/opencodeview.git",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("remote origin"))).toBe(true);
    }
  });
});

describe("remoteUrlIncludesCanonicalOwner", () => {
  test("accepts HTTPS, HTTPS-with-user, and SSH canonical URLs", () => {
    expect(remoteUrlIncludesCanonicalOwner(CANONICAL_REMOTE_URL)).toBe(true);
    expect(remoteUrlIncludesCanonicalOwner("https://github.com/4i3n6/opencodeview")).toBe(true);
    expect(remoteUrlIncludesCanonicalOwner("https://4i3n6@github.com/4i3n6/opencodeview.git")).toBe(true);
expect(remoteUrlIncludesCanonicalOwner("git@github.com:4i3n6/opencodeview.git")).toBe(true);
});

  test("rejects foreign owners and typo handles", () => {
    expect(remoteUrlIncludesCanonicalOwner("https://github.com/413n6/opencodeview.git")).toBe(false);
    expect(remoteUrlIncludesCanonicalOwner("https://github.com/other-owner/opencodeview.git")).toBe(false);
  });
});
