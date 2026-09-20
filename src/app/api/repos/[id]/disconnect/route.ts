import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repos } from "@/lib/schema";
import { getAuthorizedUser } from "@/lib/session";
import { withRouteErrors } from "@/lib/route-wrapper";
import { disconnectRepo } from "@/lib/disconnect";
import { track } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * POST /api/repos/[id]/disconnect — remove a connected repo (hard delete).
 * Cascades the repo's generation history and takes its published docs page
 * offline; frees a slot in the caller's plan repo limit immediately.
 */
async function disconnectHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await disconnectRepo(
    {
      async findRepo(repoId, userId) {
        const [row] = await db
          .select({
            id: repos.id,
            fullName: repos.githubRepoFullName,
            isHosted: repos.publishedGenerationId,
          })
          .from(repos)
          .where(and(eq(repos.id, repoId), eq(repos.userId, userId)))
          .limit(1);
        return row ? { id: row.id, fullName: row.fullName, isHosted: row.isHosted !== null } : null;
      },
      async deleteRepo(repoId) {
        // Generations cascade (repos FK on generations is onDelete: cascade).
        await db.delete(repos).where(eq(repos.id, repoId));
      },
    },
    id,
    authorized.user.id,
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  track(authorized.user.id, "repo_disconnected", { repoId: id, wasHosted: result.isHosted });
  return NextResponse.json({ disconnected: true, fullName: result.fullName });
}

export const POST = withRouteErrors("POST /api/repos/[id]/disconnect", disconnectHandler);
