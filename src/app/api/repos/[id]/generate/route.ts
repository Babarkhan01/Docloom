import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repos } from "@/lib/schema";
import { getAuthorizedUser } from "@/lib/session";
import { cleanupStaleBuckets, rateLimit } from "@/lib/rate-limit";
import { checkQuota, runGeneration } from "@/lib/generation";

export const dynamic = "force-dynamic";

/**
 * POST /api/repos/[id]/generate — kick off a documentation generation run
 * for one of the caller's repos. Enforces the free-plan daily cap (spec §4)
 * before any LLM spend.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  cleanupStaleBuckets();
  const rl = rateLimit(`repos:generate:${authorized.user.id}`, { max: 10 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 });
  }

  const { id } = await params;
  const [repo] = await db
    .select({ id: repos.id, userId: repos.userId })
    .from(repos)
    .where(and(eq(repos.id, id), eq(repos.userId, authorized.user.id)))
    .limit(1);
  if (!repo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const quota = await checkQuota(authorized.user.id);
  if (!quota.ok) return NextResponse.json({ error: quota.error, message: quota.message }, { status: quota.status });

  const outcome = await runGeneration(repo.id, "manual");
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error, message: outcome.message }, { status: outcome.status });
  }
  return NextResponse.json({
    generationId: outcome.generationId,
    endpointCount: outcome.endpointCount,
    tokensUsed: outcome.tokensUsed,
    aiUsed: outcome.aiUsed,
    quota: { used: quota.used + 1, limit: quota.limit },
  });
}
