import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { generations, repos, users } from "@/lib/schema";
import { withRouteErrors } from "@/lib/route-wrapper";
import {
  triagePush,
  verifyGitHubSignature,
  type PushEvent,
  type RepoGateState,
} from "@/lib/github-webhook";
import { runQueuedGeneration, quotaStateFor } from "@/lib/generation";
import { runAfterResponse } from "@/lib/wait-until";
import { effectivePlan } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/github — GitHub App push events (Phase 2: auto-regenerate
 * on merge, Starter/Team only, per-repo toggle, default OFF).
 *
 * Security: HMAC-SHA-256 over the RAW body with GITHUB_WEBHOOK_SECRET,
 * constant-time compared. Missing or invalid signature → 401 (same policy as
 * the Dodo endpoint; the dev test-marker escape hatch mirrors it too).
 *
 * Latency: verify → triage → enqueue → 200. The actual generation runs in
 * waitUntil after the response (or later via the cron fallback if the push
 * landed inside the debounce window). Never auto-publishes: queued runs
 * produce drafts the user approves in the dashboard.
 *
 * Deliveries that are not actionable (non-push events, other branches,
 * disconnected repos, free plans, toggle off) get a 200 with the reason —
 * GitHub retries non-2xx deliveries, and there is nothing to retry here.
 */

type PushPayload = {
  repository?: { full_name?: string };
  installation?: { id?: number };
  ref?: string;
  after?: string;
};

async function githubWebhookHandler(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  const signatureOk = verifyGitHubSignature({
    rawBody,
    signatureHeader: request.headers.get("x-hub-signature-256"),
    secret: process.env.GITHUB_WEBHOOK_SECRET,
    testMarker: request.headers.get("docloom-test-event"),
  });
  if (!signatureOk) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: PushPayload;
  try {
    payload = JSON.parse(rawBody) as PushPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const push: PushEvent = {
    event: request.headers.get("x-github-event") ?? "",
    repoFullName: payload.repository?.full_name ?? null,
    installationId: payload.installation?.id ?? null,
    ref: payload.ref ?? null,
    after: payload.after ?? null,
  };

  // Cheap pre-checks avoid a DB roundtrip for deliveries triage would ignore.
  if (push.event !== "push") {
    return NextResponse.json({ received: true, ignored: "not_a_push_event" });
  }
  if (!push.repoFullName || !push.installationId) {
    return NextResponse.json({ received: true, ignored: "malformed_push_payload" });
  }

  // The same repo can be connected by several users (same GitHub App
  // installation); each connected row is triaged against its owner's plan,
  // toggle, and quota.
  const rows = await db
    .select({
      repoId: repos.id,
      defaultBranch: repos.defaultBranch,
      autoRegenerate: repos.autoRegenerate,
      lastProcessedCommitSha: repos.lastProcessedCommitSha,
      lastWebhookAt: repos.lastWebhookAt,
      userId: users.id,
      plan: users.plan,
      dodoSubscriptionStatus: users.dodoSubscriptionStatus,
      dodoGraceUntil: users.dodoGraceUntil,
    })
    .from(repos)
    .innerJoin(users, eq(repos.userId, users.id))
    .where(
      and(
        eq(repos.githubRepoFullName, push.repoFullName),
        eq(repos.installationId, push.installationId),
      ),
    );

  if (rows.length === 0) {
    return NextResponse.json({ received: true, ignored: "repo_not_connected" });
  }

  const now = new Date();
  const notes: string[] = [];
  const toRun: string[] = [];

  for (const row of rows) {
    const plan = effectivePlan({
      plan: row.plan,
      dodoSubscriptionStatus: row.dodoSubscriptionStatus,
      dodoGraceUntil: row.dodoGraceUntil,
    });
    const quota = await quotaStateFor(row.userId);

    const gates: RepoGateState = {
      connected: true,
      defaultBranch: row.defaultBranch,
      plan,
      autoRegenerate: row.autoRegenerate,
      lastProcessedCommitSha: row.lastProcessedCommitSha,
      lastWebhookAt: row.lastWebhookAt,
      quotaUsed: quota.used,
      quotaLimit: quota.limit,
    };
    const decision = triagePush(push, gates, now);

    if (decision.action === "ignore" || decision.action === "dedupe") {
      notes.push(`${row.repoId}: ${decision.action} (${decision.reason})`);
      continue;
    }

    // Every actionable outcome refreshes the push anchor so the debounce
    // window measures actual push activity and re-deliveries dedupe.
    await db
      .update(repos)
      .set({ lastProcessedCommitSha: push.after, lastWebhookAt: now, updatedAt: now })
      .where(eq(repos.id, row.repoId));

    if (decision.action === "quota_exhausted") {
      // Record the skip on a failed row — visible in the dashboard history
      // instead of failing silently.
      await db.insert(generations).values({
        repoId: row.repoId,
        status: "failed",
        triggeredBy: "webhook",
        errorMessage: decision.message.slice(0, 500),
        completedAt: now,
      });
      notes.push(`${row.repoId}: quota_exhausted (recorded)`);
      continue;
    }

    // queue + debounce both converge on exactly one pending run per repo:
    // the run reads the repo HEAD at execution time, so the queued run covers
    // every push that landed while it was pending.
    const [pending] = await db
      .select({ id: generations.id })
      .from(generations)
      .where(and(eq(generations.repoId, row.repoId), eq(generations.status, "queued")))
      .orderBy(desc(generations.id))
      .limit(1);
    const generationId =
      pending?.id ??
      (
        await db
          .insert(generations)
          .values({ repoId: row.repoId, status: "queued", triggeredBy: "webhook" })
          .returning({ id: generations.id })
      )[0].id;

    if (decision.action === "queue") {
      // Outside the debounce window: run right after responding.
      toRun.push(generationId);
      notes.push(`${row.repoId}: queued ${generationId}`);
    } else {
      notes.push(`${row.repoId}: debounce — pending run ${generationId} will pick up this commit`);
    }
  }

  if (toRun.length > 0) {
    const ids = [...toRun];
    await runAfterResponse(async () => {
      for (const id of ids) {
        const outcome = await runQueuedGeneration(id);
        if (!outcome.ok && !("skipped" in outcome && outcome.skipped)) {
          console.error(`[github-webhook] queued run ${id} failed:`, outcome.message);
        }
      }
    });
  }

  return NextResponse.json({ received: true, notes });
}

export const POST = withRouteErrors("POST /api/webhooks/github", githubWebhookHandler);
