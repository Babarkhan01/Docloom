import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness + DB reachability for uptime monitoring
 * (UptimeRobot / Better Stack / cron-job.org all work: plain GET, no auth,
 * 2xx = healthy).
 *
 * Deliberately outside the proxy's auth matcher and unauthenticated: a
 * monitor can't hold a Docloom session. Exposes nothing but two status
 * strings — robots.txt already disallows /api for crawlers.
 *
 * A failing DB returns 503 (not 200-with-error-field) so monitors that only
 * look at status codes still page correctly. Errors are handled inline, not
 * via withRouteErrors — an outage shouldn't also fire ops alerts; the
 * monitor's own notification is the alert.
 */
const DB_CHECK_TIMEOUT_MS = 3_000;

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

export async function GET() {
  const ok = await dbOk();
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", db: ok ? "ok" : "error" },
    { status: ok ? 200 : 503 },
  );
}
