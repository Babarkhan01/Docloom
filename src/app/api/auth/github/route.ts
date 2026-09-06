import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl } from "@/lib/github";
import { cleanupStaleBuckets, clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const OAUTH_STATE_COOKIE = "docloom_oauth_state";
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
  const redirectUri = new URL("/api/auth/github/callback", request.url).toString();

  const response = NextResponse.redirect(authorizeUrl(state, redirectUri));
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS,
  });
  return response;
}