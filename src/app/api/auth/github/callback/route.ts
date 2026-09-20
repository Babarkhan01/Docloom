import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, getUser, oauthRedirectUri } from "@/lib/github";
import { cleanupStaleBuckets, clientIp, rateLimit } from "@/lib/rate-limit";
import { createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/session-core";
import { track } from "@/lib/analytics";

export const dynamic = "force-dynamic";

const OAUTH_STATE_COOKIE = "docloom_oauth_state";

const FAIL = {
  missing_params: "invalid_request",
  state_mismatch: "state_mismatch",
  github_error: "github",
  db_error: "server",
} as const;

/**
 * GET /api/auth/github/callback — GitHub redirects here after the user
 * authorizes. Exchange the code server-side (token never touches the
 * browser), upsert the user, and issue our own signed session cookie.
 */
export async function GET(request: NextRequest) {
  cleanupStaleBuckets();
  const rl = rateLimit(`auth:callback:${clientIp(request)}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (oauthError) return redirectToLogin(request, "github");
  if (!code || !state) return redirectToLogin(request, FAIL.missing_params);

  // CSRF check against the state cookie set by the login route.
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.set(OAUTH_STATE_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  if (!expectedState || expectedState !== state) {
    return redirectToLogin(request, FAIL.state_mismatch);
  }

  // Must be byte-identical to the value sent on the authorize request.
  const redirectUri = oauthRedirectUri();

  try {
    const tokens = await exchangeCode(code, redirectUri);
    const ghUser = await getUser(tokens.access_token);
    const now = new Date();

    const [row] = await db
      .insert(users)
      .values({
        githubId: String(ghUser.githubId),
        login: ghUser.login,
        name: ghUser.name,
        email: ghUser.email,
        avatarUrl: ghUser.avatarUrl,
        githubAccessTokenEncrypted: encrypt(tokens.access_token),
        githubRefreshTokenEncrypted: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : null,
        githubTokenExpiresAt: tokens.expires_in
          ? new Date(now.getTime() + tokens.expires_in * 1000)
          : null,
      })
      .onConflictDoUpdate({
        target: users.githubId,
        set: {
          login: ghUser.login,
          name: ghUser.name,
          email: ghUser.email,
          avatarUrl: ghUser.avatarUrl,
          githubAccessTokenEncrypted: encrypt(tokens.access_token),
          githubRefreshTokenEncrypted: tokens.refresh_token
            ? encrypt(tokens.refresh_token)
            : undefined, // keep the previous refresh token if GitHub returned none
          githubTokenExpiresAt: tokens.expires_in
            ? new Date(now.getTime() + tokens.expires_in * 1000)
            : undefined,
          updatedAt: now,
        },
      })
      .returning({ id: users.id, sessionVersion: users.sessionVersion });

    if (!row) return redirectToLogin(request, FAIL.db_error);

    // Activation funnel: signup (fires for both new and returning users; the
    // $pageview flow on the marketing page is what feeds the top of funnel).
    track(row.id, "signup", { login: ghUser.login, isNew: Boolean(row) });

    // One-time hint cookie so the client provider can identify this browser
    // and merge client events (CTA clicks) with server events. Contains ids
    // only — never tokens.
    const phHint = encodeURIComponent(JSON.stringify({ id: row.id, login: ghUser.login }));

    // Our own signed session token — the browser never sees the GitHub token.
    const sessionToken = await createSessionToken({
      userId: row.id,
      login: ghUser.login,
      v: row.sessionVersion,
    });

    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    response.cookies.set("docloom_ph", phHint, {
      httpOnly: false, // read by AnalyticsProvider to call posthog.identify
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 24h — only needed right after sign-in
    });
    return response;
  } catch (err) {
    console.error("OAuth callback failed:", err);
    return redirectToLogin(request, FAIL.github_error);
  }
}

function redirectToLogin(request: NextRequest, error: string) {
  return NextResponse.redirect(new URL(`/login?error=${error}`, request.url));
}