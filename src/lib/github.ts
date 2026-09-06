import { SignJWT, importPKCS8 } from "jose";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./schema";
import { decrypt, encrypt } from "./crypto";
import { getEnv } from "./env";
import { loadEnvFileSecrets } from "./env-file";
import { githubPrivateKey } from "./github-key";

// Fill any missing env vars from the optional gitignored secrets file before
// any GitHub call reads them (see env-file.ts).
loadEnvFileSecrets();

const GITHUB_API = "https://api.github.com";
const GITHUB_LOGIN = "https://github.com";

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "docloom",
};

// ---------------------------------------------------------------------------
// GitHub App JWT (used to mint read-only installation tokens)
// ---------------------------------------------------------------------------

let cachedAppJwt: { token: string; expiresAt: number } | null = null;
let cachedAppKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;

export async function getAppJwt(): Promise<string> {
  const now = Date.now();
  if (cachedAppJwt && cachedAppJwt.expiresAt > now + 60_000) return cachedAppJwt.token;
  if (!cachedAppKey) {
    cachedAppKey = await importPKCS8(githubPrivateKey(), "RS256");
  }
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(getEnv("GITHUB_APP_ID"))
    .setIssuedAt()
    .setExpirationTime("9m")
    .sign(cachedAppKey);
  cachedAppJwt = { token, expiresAt: now + 9 * 60_000 };
  return token;
}

// ---------------------------------------------------------------------------
// Low-level GitHub API
// ---------------------------------------------------------------------------

async function githubFetch<T = unknown>(
  path: string,
  token: string,
  method: "GET" | "POST" = "GET",
): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      ...GH_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    let message = `GitHub API error ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      message = body.message ?? message;
    } catch {
      // keep default message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

type ListResponse<T> = { items?: T[]; repositories?: T[]; installations?: T[] };

/** Follow pagination (per_page=100) for list endpoints. Unwraps the common
 *  GitHub collection shapes: bare array, {items}, {repositories}, {installations}. */
async function paginate<T>(path: string, token: string): Promise<T[]> {
  const results: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = (await githubFetch<ListResponse<T>>(
      `${path}${sep}per_page=100&page=${page}`,
      token,
    )) as unknown as ListResponse<T> | T[];
    const items = Array.isArray(data)
      ? data
      : (data.items ?? data.repositories ?? data.installations ?? []);
    results.push(...items);
    if (items.length < 100) break;
  }
  return results;
}

// ---------------------------------------------------------------------------
// OAuth (user-to-server)
// ---------------------------------------------------------------------------

export type OAuthTokenResponse = {
  access_token: string;
  token_type: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string | null;
  refresh_token_expires_in?: number;
};

export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: getEnv("GITHUB_CLIENT_ID"),
    redirect_uri: redirectUri,
    state,
    // GitHub Apps carry permissions from the app config — no scope param.
  });
  return `${GITHUB_LOGIN}/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<OAuthTokenResponse> {
  const res = await fetch(`${GITHUB_LOGIN}/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...GH_HEADERS },
    body: JSON.stringify({
      client_id: getEnv("GITHUB_CLIENT_ID"),
      client_secret: getEnv("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as OAuthTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || data.error) {
    throw new Error(`GitHub OAuth exchange failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data;
}

export async function refreshUserToken(refreshToken: string): Promise<OAuthTokenResponse> {
  const res = await fetch(`${GITHUB_LOGIN}/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...GH_HEADERS },
    body: JSON.stringify({
      client_id: getEnv("GITHUB_CLIENT_ID"),
      client_secret: getEnv("GITHUB_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = (await res.json()) as OAuthTokenResponse & { error?: string; error_description?: string };
  if (!res.ok || data.error) {
    throw new Error(`GitHub token refresh failed: ${data.error_description ?? data.error ?? res.status}`);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Users & repositories
// ---------------------------------------------------------------------------

export type GitHubUser = {
  githubId: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
};

export async function getUser(userToken: string): Promise<GitHubUser> {
  const data = await githubFetch<{
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  }>("/user", userToken);
  return {
    githubId: data.id,
    login: data.login,
    name: data.name,
    // GitHub only returns the email here if it is public on the profile.
    email: data.email,
    avatarUrl: data.avatar_url,
  };
}

export type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
  installationId: number | null;
};

/**
 * All repositories the user can access through the app's installations.
 * Uses the user-to-server token (no scope needed — permissions come from the
 * GitHub App config: Contents + Metadata, both read-only).
 */
export async function getUserRepos(userToken: string): Promise<GitHubRepo[]> {
  type RawRepo = {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string | null;
    owner: { login: string } | null;
  };

  // User-to-server listing: enumerate the installations the user can access,
  // then each installation's repositories. (GET /installation/repositories is
  // a server-to-server endpoint — it returns 403 with a user token.)
  const installations = await paginate<{
    id: number;
    account: { login: string } | null;
  }>("/user/installations", userToken);

  const repos: GitHubRepo[] = [];
  for (const inst of installations) {
    const raw = await paginate<RawRepo>(
      `/user/installations/${inst.id}/repositories`,
      userToken,
    );
    for (const r of raw) {
      repos.push({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        owner: r.owner?.login ?? r.full_name.split("/")[0] ?? "",
        isPrivate: r.private === true,
        defaultBranch: r.default_branch ?? "main",
        // Every repo listed through an installation belongs to it — no
        // account-name matching (and no nulls to resolve later).
        installationId: inst.id,
      });
    }
  }
  return repos;
}

/**
 * Find the installation that grants access to a given repo.
 * Fast path: the installing account owns the repo. Fallback: enumerate each
 * installation's repositories with the app JWT until we find a match.
 */
export async function resolveInstallationId(
  owner: string,
  name: string,
  userToken: string,
): Promise<number | null> {
  const installations = await paginate<{
    id: number;
    account: { login: string } | null;
  }>("/user/installations", userToken);

  for (const inst of installations) {
    if (inst.account?.login === owner) return inst.id;
  }

  const appJwt = await getAppJwt();
  for (const inst of installations) {
    const repos = await paginate<{ full_name: string }>(
      `/app/installations/${inst.id}/repositories`,
      appJwt,
    );
    if (repos.some((r) => r.full_name === `${owner}/${name}`)) return inst.id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Installation tokens (short-lived, read-only, cached until near expiry)
// ---------------------------------------------------------------------------

const installationTokenCache = new Map<number, { token: string; expiresAt: number }>();

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const appJwt = await getAppJwt();
  const data = await githubFetch<{ token: string; expires_at: string }>(
    `/app/installations/${installationId}/access_tokens`,
    appJwt,
    "POST",
  );
  const expiresAt = new Date(data.expires_at).getTime();
  installationTokenCache.set(installationId, { token: data.token, expiresAt });
  return data.token;
}

// ---------------------------------------------------------------------------
// User token lifecycle (DB-backed, refreshed when near expiry)
// ---------------------------------------------------------------------------

/**
 * Return a valid user-to-server token for the user, refreshing from the stored
 * refresh token when the access token is close to expiry. Tokens are encrypted
 * at rest (never stored in plaintext).
 */
export async function ensureFreshUserToken(userId: string): Promise<string> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.githubAccessTokenEncrypted) {
    throw new Error("No GitHub token stored for this user — please sign in again");
  }

  const accessToken = decrypt(user.githubAccessTokenEncrypted);
  const expiresAt = user.githubTokenExpiresAt?.getTime() ?? 0;
  if (expiresAt > Date.now() + 5 * 60_000) return accessToken;

  if (!user.githubRefreshTokenEncrypted) {
    throw new Error("GitHub session expired — please sign in again");
  }

  const tokens = await refreshUserToken(decrypt(user.githubRefreshTokenEncrypted));
  if (!tokens.access_token) {
    throw new Error("GitHub token refresh failed");
  }

  const now = new Date();
  await db
    .update(users)
    .set({
      githubAccessTokenEncrypted: encrypt(tokens.access_token),
      githubRefreshTokenEncrypted: tokens.refresh_token
        ? encrypt(tokens.refresh_token)
        : user.githubRefreshTokenEncrypted,
      githubTokenExpiresAt: tokens.expires_in
        ? new Date(now.getTime() + tokens.expires_in * 1000)
        : user.githubTokenExpiresAt,
      updatedAt: now,
    })
    .where(and(eq(users.id, userId)));

  return tokens.access_token;
}