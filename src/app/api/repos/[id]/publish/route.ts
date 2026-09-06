import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { generations, repos } from "@/lib/schema";
import { getAuthorizedUser } from "@/lib/session";
import { cleanupStaleBuckets, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/repos/[id]/publish — promote a successful draft generation to
 * the repo's published docs (PRD: publish only after explicit approval of
 * the diff preview; never auto-publish).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  cleanupStaleBuckets();
  const rl = rateLimit(`repos:publish:${authorized.user.id}`, { max: 30 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 });
  }

  const { id } = await params;
  const [repo] = await db
    .select({ id: repos.id })
    .from(repos)
    .where(and(eq(repos.id, id), eq(repos.userId, authorized.user.id)))
    .limit(1);
  if (!repo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: { generationId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const generationId = typeof body.generationId === "string" ? body.generationId : "";
  if (!generationId) return NextResponse.json({ error: "missing_generation_id" }, { status: 400 });

  const [gen] = await db
    .select({ id: generations.id, status: generations.status, markdown: generations.markdown })
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.repoId, id)))
    .limit(1);
  if (!gen || !gen.markdown) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (gen.status !== "success") {
    return NextResponse.json({ error: "not_publishable", message: "Only successful generations can be published." }, { status: 409 });
  }

  await db.update(generations).set({ publishedAt: new Date() }).where(eq(generations.id, gen.id));
  await db
    .update(repos)
    .set({ publishedGenerationId: gen.id, updatedAt: new Date() })
    .where(eq(repos.id, id));

  return NextResponse.json({ published: true, generationId: gen.id });
}
