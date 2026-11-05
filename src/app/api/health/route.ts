import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { activeProviderName } from "@/lib/ai";
import { lastLlmFailure } from "@/lib/llm";
import { playgroundLlmFallback } from "@/lib/playground";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness for uptime monitoring (UptimeRobot / Better
 * Stack / cron-job.org all work: plain GET, no auth, 2xx = healthy).
 *
 * **Does not touch the database by default.** A monitor pinging every minute
 * used to run `select 1` each time, which resets Neon's idle timer and keeps
 * the free-plan compute awake around the clock. The plain response is
 * generated without any I/O, so monitoring is free of database wake-ups.
 *
 * Pass `?deep=1` together with `Authorization: Bearer $DOCLOOM_CRON_SECRET`
 * to run the DB probe: that is the deliberate, authenticated check for an
 * operator or an external job. Without the secret the route is 401 and never
 * queries the DB, so a stranger cannot wake compute through it. Auth fails
 * closed: no secret configured → always 401.
 *
 * Deliberately outside the proxy's auth matcher and unauthenticated for the
 * shallow mode: a monitor can't hold a Docloom session. Exposes nothing but
 * status strings — robots.txt already disallows /api for crawlers.
 *
 * A failing deep DB check returns 503 (not 200-with-error-field) so callers
 * that only look at status codes still fail correctly. Errors are handled
 * inline, not via withRouteErrors — an outage shouldn't also fire ops alerts;
 * the caller's own notification is the alert.
 */
const DB_CHECK_TIMEOUT_MS = 3_000;

function deepCheckAuthorized(header: string | null): boolean {
  const secret = process.env.DOCLOOM_CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(header, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function dbOk(): Promise<boolean> {
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("db check timeout")), DB_CHECK_TIMEOUT_MS),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  if (deep && !deepCheckAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // "skipped" is explicit, never "ok": an uptime monitor should not read a
  // liveness 200 as proof that Postgres is reachable.
  const dbState: "ok" | "error" | "skipped" = deep ? ((await dbOk()) ? "ok" : "error") : "skipped";
  const ok = dbState !== "error";
  // Provider DIAGNOSTICS only — never status, never keys. The provider's
  // failure memory does not affect the health verdict: a broken LLM key is
  // not a dead service (docs still generate structurally). "configured:
  // none" = the stub/JSDoc-fallback path.
  const provider = activeProviderName();
  const llm = lastLlmFailure();
  const payload: Record<string, unknown> = {
    status: ok ? "ok" : "degraded",
    db: dbState,
    llmProvider: provider ?? "configured: none",
    // Playground budget guard state (boolean only): true = playground runs
    // are in non-AI fallback because the daily LLM budget is exhausted.
    playgroundLlmFallback: playgroundLlmFallback(),
  };
  if (llm) payload.llmLastFailure = llm;
  return NextResponse.json(payload, { status: ok ? 200 : 503 });
}
