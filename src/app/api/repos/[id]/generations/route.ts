import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { generations, repos } from "@/lib/schema";
import { getAuthorizedUser } from "@/lib/session";
import { withRouteErrors } from "@/lib/route-wrapper";

export const dynamic = "force-dynamic";

/**
 * GET /api/repos/[id]/generations — list generation runs for the caller's
 * repo (status list only; full markdown comes from the draft/published APIs).
 */
async function listGenerationsHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [repo] = await db
    .select({ id: repos.id })
    .from(repos)
    .where(and(eq(repos.id, id), eq(repos.userId, authorized.user.id)))
    .limit(1);
  if (!repo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const rows = await db
    .select({
      id: generations.id,
      status: generations.status,
      tokensUsed: generations.tokensUsed,
      triggeredBy: generations.triggeredBy,
      startedAt: generations.startedAt,
      completedAt: generations.completedAt,
      errorMessage: generations.errorMessage,
      publishedAt: generations.publishedAt,
    })
    .from(generations)
    .where(eq(generations.repoId, id))
    .orderBy(desc(generations.startedAt))
    .limit(50);

  return NextResponse.json({ generations: rows });
}

export const GET = withRouteErrors("GET /api/repos/[id]/generations", listGenerationsHandler);
