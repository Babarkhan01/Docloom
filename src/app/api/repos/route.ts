import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { generations, repos } from "@/lib/schema";
import {
  ensureFreshUserToken,
  getUserRepos,
  resolveInstallationId,
} from "@/lib/github";
import { cleanupStaleBuckets, rateLimit } from "@/lib/rate-limit";
import { getAuthorizedUser } from "@/lib/session";
import { withRouteErrors } from "@/lib/route-wrapper";
import { slugify } from "@/lib/slug";
import { track } from "@/lib/analytics";
import { checkConnectEligibility, effectivePlan } from "@/lib/billing";

export const dynamic = "force-dynamic";

const FULL_NAME_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

// ---------------------------------------------------------------------------
// GET /api/repos — connected repos for the current user, with the latest
// generation status per repo (tech spec §2: status lives on `generations`).
// ---------------------------------------------------------------------------

async function reposGetHandler() {
  const authorized = await getAuthorizedUser();
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  cleanupStaleBuckets();
  const rl = rateLimit(`repos:list:${authorized.user.id}`, { max: 120 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  const userRepos = await db
    .select()
    .from(repos)
    .where(eq(repos.userId, authorized.user.id))
    .orderBy(desc(repos.connectedAt));

  const ids = userRepos.map((r) => r.id);
  const genRows = ids.length
    ? await db.select().from(generations).where(inArray(generations.repoId, ids))
    : [];

  const latestByRepo = new Map<string, (typeof genRows)[number]>();
  for (const g of genRows) {
    const current = latestByRepo.get(g.repoId);
    const gKey = (g.completedAt ?? g.startedAt ?? new Date(0)).getTime();
    const curKey = current
      ? (current.completedAt ?? current.startedAt ?? new Date(0)).getTime()
      : -1;
    if (!current || gKey > curKey) latestByRepo.set(g.repoId, g);
  }

  return NextResponse.json({
    repos: userRepos.map((r) => {
      const gen = latestByRepo.get(r.id);
      return {
        id: r.id,
        fullName: r.githubRepoFullName,
        owner: r.owner,
        name: r.name,
        isPrivate: r.isPrivate,
        defaultBranch: r.defaultBranch,
        docsSubdomain: r.docsSubdomain,
        status: r.status,
        connectedAt: r.connectedAt,
        lastGeneratedAt: r.lastGeneratedAt,
        lastGeneration: gen
          ? {
              status: gen.status,
              triggeredBy: gen.triggeredBy,
              completedAt: gen.completedAt,
              errorMessage: gen.errorMessage,
            }
          : null,
      };
    }),
  });
}

export const GET = withRouteErrors("GET /api/repos", reposGetHandler);

// ---------------------------------------------------------------------------
// POST /api/repos — connect a repo by full name (e.g. "acme/api-server").
// Stores metadata only; source code is never persisted (project principle).
// ---------------------------------------------------------------------------

async function reposPostHandler(request: NextRequest) {
  const authorized = await getAuthorizedUser();
  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  cleanupStaleBuckets();
  const rl = rateLimit(`repos:connect:${authorized.user.id}`, { max: 30 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds },
      { status: 429 },
    );
  }

  let body: { fullName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  if (!FULL_NAME_RE.test(fullName)) {
    return NextResponse.json(
      { error: "invalid_full_name", message: "Repo must look like owner/name." },
      { status: 400 },
    );
  }

  const [existing] = await db
    .select({ id: repos.id })
    .from(repos)
    .where(
      and(eq(repos.userId, authorized.user.id), eq(repos.githubRepoFullName, fullName)),
    )
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "already_connected", message: `${fullName} is already connected.` },
      { status: 409 },
    );
  }

  // Plan gate for NEW connects (repos connected before the tier split are
  // grandfathered: they keep working, they just count toward the limit).
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(repos)
    .where(eq(repos.userId, authorized.user.id));
  // The repo's privacy is only known after matching it on GitHub, so the
  // privacy half of the gate is re-checked in the try block below. The count
  // half is checked here to fail fast without a GitHub round-trip.
  const countGate = checkConnectEligibility({
    plan: effectivePlan(authorized.user),
    connectedCount: count,
    isPrivate: false,
  });
  if (!countGate.ok && countGate.reason === "repo_limit") {
    return NextResponse.json(
      { error: countGate.error, message: countGate.message, upgradeTo: countGate.upgradeTo },
      { status: countGate.status },
    );
  }

  try {
    const token = await ensureFreshUserToken(authorized.user.id);
    const githubRepos = await getUserRepos(token);
    const match = githubRepos.find((r) => r.fullName === fullName);
    if (!match) {
      return NextResponse.json(
        {
          error: "not_found",
          message: `${fullName} isn't accessible — is the Docloom GitHub App installed on it?`,
        },
        { status: 404 },
      );
    }

    const installationId =
      match.installationId ?? (await resolveInstallationId(match.owner, match.name, token));
    if (!installationId) {
      return NextResponse.json(
        {
          error: "no_installation",
          message: `Couldn't determine a GitHub installation for ${fullName}. Reinstall the Docloom GitHub App and try again.`,
        },
        { status: 422 },
      );
    }

    // Privacy half of the plan gate — authoritative now that we know isPrivate.
    const privacyGate = checkConnectEligibility({
      plan: effectivePlan(authorized.user),
      connectedCount: count,
      isPrivate: match.isPrivate,
    });
    if (!privacyGate.ok) {
      return NextResponse.json(
        { error: privacyGate.error, message: privacyGate.message, upgradeTo: privacyGate.upgradeTo },
        { status: privacyGate.status },
      );
    }

    const docsSubdomain = await uniqueDocsSubdomain(slugify(fullName));

    const [created] = await db
      .insert(repos)
      .values({
        userId: authorized.user.id,
        githubRepoFullName: match.fullName,
        owner: match.owner,
        name: match.name,
        installationId,
        defaultBranch: match.defaultBranch,
        isPrivate: match.isPrivate,
        docsSubdomain,
      })
      .returning();

    track(authorized.user.id, "repo_connected", {
      repo: created.githubRepoFullName,
      isPrivate: created.isPrivate,
    });

    return NextResponse.json(
      {
        repo: {
          id: created.id,
          fullName: created.githubRepoFullName,
          owner: created.owner,
          name: created.name,
          isPrivate: created.isPrivate,
          defaultBranch: created.defaultBranch,
          docsSubdomain: created.docsSubdomain,
          status: created.status,
          connectedAt: created.connectedAt,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("Failed to connect repo:", err);
    return NextResponse.json(
      {
        error: "github_reauth_required",
        message: "GitHub access needs to be refreshed — please sign in again.",
      },
      { status: 401 },
    );
  }
}

export const POST = withRouteErrors("POST /api/repos", reposPostHandler);

async function uniqueDocsSubdomain(base: string): Promise<string> {
  let candidate = base;
  for (let i = 2; ; i++) {
    const [taken] = await db
      .select({ sub: repos.docsSubdomain })
      .from(repos)
      .where(eq(repos.docsSubdomain, candidate))
      .limit(1);
    if (!taken) return candidate;
    candidate = `${base}-${i}`;
  }
}