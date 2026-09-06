import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { generations, repos } from "@/lib/schema";
import { getAuthorizedUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * POST /api/repos/[id]/discard — delete unpublished draft generations for
 * the caller's repo. A published generation is never deletable here; if it
 * is the current draft it is simply dropped from review.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [repo] = await db
    .select({ id: repos.id, publishedGenerationId: repos.publishedGenerationId })
    .from(repos)
    .where(and(eq(repos.id, id), eq(repos.userId, authorized.user.id)))
    .limit(1);
  if (!repo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const drafts = await db
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.repoId, id), eq(generations.status, "success")));

  const deletable = drafts.map((d) => d.id).filter((gid) => gid !== repo.publishedGenerationId);
  if (deletable.length === 0) return NextResponse.json({ discarded: 0 });

  await db.delete(generations).where(inArray(generations.id, deletable));
  return NextResponse.json({ discarded: deletable.length });
}
