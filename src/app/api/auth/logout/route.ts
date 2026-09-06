import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { getAuthorizedUser, SESSION_COOKIE } from "@/lib/session";
import { withRouteErrors } from "@/lib/route-wrapper";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/logout — invalidate the session server-side (bump
 * session_version so all previously issued tokens are rejected by
 * getAuthorizedUser) and clear the cookie (tech spec §1).
 */
async function logoutHandler(request: NextRequest) {
  const authorized = await getAuthorizedUser();
  if (authorized) {
    await db
      .update(users)
      .set({
        sessionVersion: authorized.user.sessionVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, authorized.user.id));
  }

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export const POST = withRouteErrors("POST /api/auth/logout", logoutHandler);