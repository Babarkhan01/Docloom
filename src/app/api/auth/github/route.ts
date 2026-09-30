import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, oauthRedirectUri } from "@/lib/github";
import { cleanupStaleBuckets, clientIp, rateLimit } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-redirect";

export const dynamic = "force-dynamic";

const OAUTH_STATE_COOKIE = "docloom_oauth_state";
const POST_LOGIN_NEXT_COOKIE = "docloom_post_login_next";
const STATE_MAX_AGE_SECONDS = 600;

/**
 * GET /api/auth/github — kick off the GitHub App OAuth flow
 * (authorization code grant, user-to-server token).
 */
export async function GET(request: NextRequest) {
  cleanupStaleBuckets();
  const rl = rateLimit(`auth:login:${clientIp(request)}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  // CSRF protection: random state, stored in a short-lived httpOnly cookie.
  const state = randomBytes(16).toString("hex");
  // From APP_URL, not request.url — GitHub requires an exact match against the
  // App's registered callback URL (see oauthRedirectUri in lib/github.ts).
  const redirectUri = oauthRedirectUri();

  const response = NextResponse.redirect(authorizeUrl(state, redirectUri));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS,
  });

  // Post-login destination (P1.6): the playground sends ?next=/dashboard?connect=…
  // so a prospect who just generated docs lands in the connect flow for that
  // same repo. Validated to a same-origin path; cleared by the callback.
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  if (next) {
    response.cookies.set(POST_LOGIN_NEXT_COOKIE, next, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: STATE_MAX_AGE_SECONDS,
    });
  }
  return response;
}