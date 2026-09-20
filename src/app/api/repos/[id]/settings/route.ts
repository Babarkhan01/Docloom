import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repos } from "@/lib/schema";
import { getAuthorizedUser } from "@/lib/session";
import { withRouteErrors } from "@/lib/route-wrapper";
import { allowsAutoRegenerate, effectivePlan } from "@/lib/billing";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/repos/[id]/settings — per-repo settings. Currently the
 * auto-regenerate toggle (Phase 2): turning it ON requires a paid plan
 * (Starter/Team). The webhook re-checks the plan at push time, so a lapsed
 * subscription simply stops regenerating until renewed — the toggle itself
 * is honest about what it controls.
 */
async function settingsHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const [repo] = await db
    .select({ id: repos.id, autoRegenerate: repos.autoRegenerate })
    .from(repos)
    .where(and(eq(repos.id, id), eq(repos.userId, authorized.user.id)))
    .limit(1);
  if (!repo) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: { autoRegenerate?: unknown };
  try {
    body = (await request.json()) as { autoRegenerate?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof body.autoRegenerate !== "boolean") {
    return NextResponse.json({ error: "invalid_body", message: "autoRegenerate must be a boolean." }, { status: 400 });
  }

  if (body.autoRegenerate && !allowsAutoRegenerate(effectivePlan(authorized.user))) {
    return NextResponse.json(
      {
        error: "upgrade_required",
        upgradeTo: "starter",
        message:
          "Auto-regenerate on every merge is a Starter feature. Upgrade to Starter ($19/mo) to keep your docs fresh automatically — each merge produces a draft for your approval, and nothing is ever published without you.",
      },
      { status: 403 },
    );
  }

  await db
    .update(repos)
    .set({ autoRegenerate: body.autoRegenerate, updatedAt: new Date() })
    .where(eq(repos.id, repo.id));

  return NextResponse.json({ autoRegenerate: body.autoRegenerate });
}

export const PATCH = withRouteErrors("PATCH /api/repos/[id]/settings", settingsHandler);
