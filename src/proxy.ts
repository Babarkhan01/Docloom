import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  verifyAndMaybeRefresh,
} from "@/lib/session-core";

/**
 * Auth gate. Cheap signature/expiry check only — the authoritative check
 * (session_version + user existence) happens in route handlers/server
 * components via getAuthorizedUser(). Never rely on this alone (tech spec §1).
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const { authed, refreshedToken } = token ? await verifyAndMaybeRefresh(token) : { authed: false };

  const { pathname } = request.nextUrl;

  let response: NextResponse;
  if (pathname.startsWith("/api/")) {
    if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    response = NextResponse.next();
  } else if (pathname === "/login") {
    if (authed) return NextResponse.redirect(new URL("/dashboard", request.url));
    response = NextResponse.next();
  } else {
    // /dashboard/*
    if (!authed) return NextResponse.redirect(new URL("/login", request.url));
    response = NextResponse.next();
  }

  // Sliding session refresh: re-issue a short-lived token when the current
  // one is past the refresh threshold.
  if (refreshedToken) {
    response.cookies.set(SESSION_COOKIE, refreshedToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/repos/:path*", "/login"],
};