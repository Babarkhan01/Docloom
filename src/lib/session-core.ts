import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "./env";

export const SESSION_COOKIE = "docloom_session";
// Short-lived per tech spec §1 — 24h, with sliding refresh (see below).
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;
// Re-issue the token (sliding refresh) once it is older than this.
export const SESSION_REFRESH_AFTER_SECONDS = 12 * 60 * 60;

export type SessionPayload = {
  userId: string;
  login: string;
  // Must match users.session_version — bumped on logout to invalidate
  // issued tokens server-side (tech spec §1).
  v: number;
};

function secret(): Uint8Array {
  return new TextEncoder().encode(getEnv("SESSION_SECRET"));
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ login: payload.login, v: payload.v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string" || typeof payload.login !== "string" || typeof payload.v !== "number") {
      return null;
    }
    return { userId: payload.sub, login: payload.login, v: payload.v };
  } catch {
    return null;
  }
}

/**
 * Verify a token and, if it is valid but older than the refresh threshold,
 * re-issue a fresh one (sliding session, per tech spec §1: short-lived +
 * refresh rather than long-lived). Returns the fresh token only when one
 * should be set; `authed: false` means the token is invalid/expired.
 */
export async function verifyAndMaybeRefresh(
  token: string,
): Promise<{ authed: boolean; refreshedToken?: string }> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== "string" || typeof payload.login !== "string" || typeof payload.v !== "number") {
      return { authed: false };
    }
    const iat = payload.iat ?? 0;
    if (Date.now() / 1000 - iat >= SESSION_REFRESH_AFTER_SECONDS) {
      return {
        authed: true,
        refreshedToken: await createSessionToken({
          userId: payload.sub,
          login: payload.login,
          v: payload.v,
        }),
      };
    }
    return { authed: true };
  } catch {
    return { authed: false };
  }
}