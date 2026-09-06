import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./schema";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./session-core";

export { SESSION_COOKIE, createSessionToken, verifySessionToken, type SessionPayload };

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Authoritative auth check for route handlers and server components.
 * Enforces server-side session invalidation: the token's `v` must match the
 * user's current session_version (bumped on logout), and the user must exist.
 * Never trust client-side checks alone (tech spec §1).
 */
export async function getAuthorizedUser() {
  const session = await getSession();
  if (!session) return null;

  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.sessionVersion !== session.v) return null;

  return { session, user };
}

export type AuthorizedUser = NonNullable<Awaited<ReturnType<typeof getAuthorizedUser>>>;