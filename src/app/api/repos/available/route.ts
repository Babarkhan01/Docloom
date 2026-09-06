import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repos } from "@/lib/schema";
import { ensureFreshUserToken, getUserRepos } from "@/lib/github";
import { cleanupStaleBuckets, rateLimit } from "@/lib/rate-limit";
import { getAuthorizedUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/repos/available — repositories the user can connect through the
 * GitHub App, minus the ones already connected. Backed by the user's
 * read-only user-to-server token (Contents: read, Metadata: read).
 */
export async function GET() {
  const authorized = await getAuthorizedUser();
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  cleanupStaleBuckets();
  const rl = rateLimit(`repos:available:${authorized.user.id}`, { max: 60 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  try {
    const token = await ensureFreshUserToken(authorized.user.id);
    const [githubRepos, connected] = await Promise.all([
      getUserRepos(token),
      db
        .select({ fullName: repos.githubRepoFullName })
        .from(repos)
        .where(eq(repos.userId, authorized.user.id)),
    ]);

    const connectedSet = new Set(connected.map((r) => r.fullName));
    const available = githubRepos
      .filter((r) => !connectedSet.has(r.fullName))
      .map((r) => ({
        fullName: r.fullName,
        owner: r.owner,
        name: r.name,
        isPrivate: r.isPrivate,
        defaultBranch: r.defaultBranch,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return NextResponse.json({ repos: available });
  } catch (err) {
    // Includes GitHub token revoked/expired and refresh failures — prompt
    // re-auth instead of crashing (tech spec §1: handle revocation gracefully).
    console.error("Failed to list available repos:", err);
    return NextResponse.json(
      {
        error: "github_reauth_required",
        message: "GitHub access needs to be refreshed — please sign in again.",
      },
      { status: 401 },
    );
  }
}