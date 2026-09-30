import { NextResponse, type NextRequest } from "next/server";
import {
  acquirePlaygroundSlot,
  parseRepoInput,
  playgroundBurstLimit,
  playgroundDailyLimit,
  playgroundLimits,
  runPlaygroundGeneration,
} from "@/lib/playground";
import { cleanupStaleBuckets, clientIp } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";
import { withRouteErrors } from "@/lib/route-wrapper";

export const dynamic = "force-dynamic";

/**
 * POST /api/playground/generate — the no-signup entry point.
 *
 * Public by design (the proxy's matcher only gates /api/repos/*), so this
 * handler is its own gate: three nested spend controls + a hard refusal for
 * anything that isn't a public GitHub repo. Anonymous generations are never
 * written to the DB — source is processed in memory and dropped.
 */

function tooMany(rl: { retryAfterSeconds: number }, error: string, message: string) {
  return NextResponse.json(
    { error, message, retryAfterSeconds: rl.retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
  );
}

async function handler(request: NextRequest) {
  // 1. Per-IP burst (abuse: rapid-fire probing) then daily (the durable cap
  // that survives isolate restarts, keyed off rate-limit.ts's in-memory store).
  cleanupStaleBuckets();
  const ip = clientIp(request);
  const burst = playgroundBurstLimit(ip);
  if (!burst.ok) {
    return tooMany(
      burst,
      "rate_limited",
      "Slow down a little — try again in a minute.",
    );
  }
  const { dailyIpLimit } = playgroundLimits();
  const daily = playgroundDailyLimit(ip, dailyIpLimit);
  if (!daily.ok) {
    return tooMany(
      daily,
      "daily_limit_reached",
      `That's the ${dailyIpLimit} free playground runs for today. Sign in to connect the repo properly and keep generating.`,
    );
  }    // 2. Global capacity (GitHub's anonymous/token rate limit is the real
    // ceiling — this guard keeps the whole playground inside it).
    //
    // NOTE: without a GitHub PAT (PLAYGROUND_GITHUB_TOKEN) the anonymous GitHub
    // API allows only ~60 requests/hour, so the playground's hourly run cap
    // defaults to 1/hour. The first request in an hour works; a second request
    // in the same hour will get "busy" 429 until the next hour rolls over. If
    // you genuinely need more than one run per hour, set PLAYGROUND_GITHUB_TOKEN
    // on the deployed environment.
    const slot = acquirePlaygroundSlot();
  if (!slot.ok) {
    return tooMany(
      slot,
      "busy",
      "The playground is at capacity right now — try again shortly.",
    );
  }

  // 3. Input validation before any network call.
  let body: { repo?: unknown };
  try {
    body = (await request.json()) as { repo?: unknown };
  } catch {
    slot.release();
    return NextResponse.json(
      { error: "invalid_body", message: "Send JSON: { \"repo\": \"owner/name\" }." },
      { status: 400 },
    );
  }
  const raw = typeof body.repo === "string" ? body.repo.trim() : "";
  const parsed = parseRepoInput(raw);
  if (!parsed) {
    slot.release();
    return NextResponse.json(
      {
        error: "invalid_repo",
        message: "Enter a GitHub repo as owner/name or a github.com URL (public repos only).",
      },
      { status: 400 },
    );
  }

  try {
    const result = await runPlaygroundGeneration(parsed);
    if ("markdown" in result) {
      track(ip, "playground_generated", {
        repo: result.meta.repo,
        endpoints: result.meta.endpointCount,
        filesScanned: result.meta.filesScanned,
        ai: false,
      });
      return NextResponse.json({ markdown: result.markdown, meta: result.meta });
    }
    // Structured failure from the pipeline (not-found, private repo, too
    // large, GitHub rate limit…). 429s get a Retry-After like the caps above.
    const headers =
      result.status === 429 ? { "Retry-After": "60" } : undefined;
    return NextResponse.json(
      { error: result.error, message: result.message },
      { status: result.status, headers },
    );
  } finally {
    slot.release();
  }
}

export const POST = withRouteErrors("POST /api/playground/generate", handler);
