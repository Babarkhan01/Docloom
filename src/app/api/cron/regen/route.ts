import { NextResponse } from "next/server";
import { and, asc, eq, lt } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { generations } from "@/lib/schema";
import { withRouteErrors } from "@/lib/route-wrapper";
import { cronMaxRuns, runQueuedGeneration } from "@/lib/generation";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/regen — cron fallback for queued auto-regenerate runs.
 *
 * Delivery: an external scheduler (GitHub Actions cron, cron-job.org, …) GETs
 * this route with `Authorization: Bearer $DOCLOOM_CRON_SECRET`. Cloudflare
 * cron triggers cannot drive an OpenNext worker (the generated worker exports
 * no scheduled() handler), so the pinger is the transport. The route needs a
 * deploy before the pinger can work — deploying is a deliberate, separate
 * step.
 *
 * Run it every 6 hours, not every 5 minutes. Every tick queries the database
 * (re-queue sweep + queued select) even when there is nothing to do, and Neon
 * suspends compute only after ~5 idle minutes — a 5-minute pinger therefore
 * keeps the database awake 24/7 and burns the monthly compute quota. At 6
 * hours a stranded run just waits until the next tick, which is acceptable:
 * this is a recovery path, not the normal one (the GitHub webhook drives runs
 * immediately via waitUntil; this only catches a dead isolate or a failed
 * waitUntil). Six-hourly ticks cost ~4 wake-ups/day.
 *
 * Two jobs:
 * 1. Re-drive `queued` runs stranded by the debounce window (or by a failed
 *    waitUntil), oldest first, up to DOCLOOM_CRON_MAX_RUNS per tick (default 1
 *    — each run costs ~30 subrequests, and Workers Free allows 50/invocation).
 * 2. Reset `processing` rows older than 15 minutes back to queued: a live run
 *    finishes in seconds, so an old processing row is a dead isolate whose
 *    claim was never released. Re-queuing is safe — runs never publish.
 *
 * Auth fails closed: 401 unless the bearer token matches the configured
 * secret (constant-time compare). No secret configured → always 401.
 */
const STUCK_PROCESSING_MS = 15 * 60 * 1000;

function cronAuthorized(header: string | null): boolean {
  const secret = process.env.DOCLOOM_CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const received = Buffer.from(header, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

async function cronRegenHandler(request: Request): Promise<NextResponse> {
  if (!cronAuthorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Recover dead-isolate claims.
  const stuckCutoff = new Date(Date.now() - STUCK_PROCESSING_MS);
  const requeued = await db
    .update(generations)
    .set({ status: "queued", startedAt: null })
    .where(
      and(
        eq(generations.status, "processing"),
        eq(generations.triggeredBy, "webhook"),
        lt(generations.startedAt, stuckCutoff),
      ),
    )
    .returning({ id: generations.id });

  // 1. Drive queued runs, oldest first.
  const queued = await db
    .select({ id: generations.id })
    .from(generations)
    .where(eq(generations.status, "queued"))
    .orderBy(asc(generations.id))
    .limit(cronMaxRuns());

  const results: { id: string; ok: boolean; note?: string }[] = [];
  for (const row of queued) {
    const outcome = await runQueuedGeneration(row.id);
    results.push({
      id: row.id,
      ok: outcome.ok,
      note: outcome.ok ? `${outcome.endpointCount} endpoints` : outcome.message,
    });
  }

  return NextResponse.json({ requeuedStale: requeued.length, driven: results });
}

export const GET = withRouteErrors("GET /api/cron/regen", cronRegenHandler);
