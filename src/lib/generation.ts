import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { generations, repos, usageCounters } from "./schema";
import { fetchRepoBlob, fetchRepoTree } from "./github";
import { parseRouteFiles } from "./route-parser";
import { aiEnabled, describeRoutes } from "./ai";
import { buildApiMarkdown } from "./docs";

/**
 * Generation pipeline: fetch (read-only installation token) → AST parse →
 * AI prose over facts → markdown. Source code is processed in memory and
 * never persisted (project principle).
 */

const MAX_FILES = 50;
const MAX_FILE_BYTES = 64 * 1024;

export type GenerationOutcome =
  | { ok: true; generationId: string; endpointCount: number; tokensUsed: number; aiUsed: boolean }
  | { ok: false; status: number; error: string; message: string };

/** Free-plan daily cap (spec §4: limits must exist before LLM spend). */
export function dailyGenerationLimit(): number {
  return Number(process.env.DOCLOOM_DAILY_GENERATION_LIMIT ?? 5);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function quotaState(userId: string) {
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, today())))
    .limit(1);
  return { used: row?.generationsCount ?? 0, limit: dailyGenerationLimit() };
}

async function bumpQuota(userId: string, tokens: number): Promise<void> {
  await db
    .insert(usageCounters)
    .values({ userId, periodStart: today(), generationsCount: 1, tokensUsedTotal: tokens })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.periodStart],
      set: {
        generationsCount: sql`${usageCounters.generationsCount} + 1`,
        tokensUsedTotal: sql`${usageCounters.tokensUsedTotal} + ${tokens}`,
      },
    });
}

/** Quota check for the generate route; returns a 429-shaped outcome when exhausted. */
export async function checkQuota(
  userId: string,
): Promise<{ ok: true; used: number; limit: number } | { ok: false; status: number; error: string; message: string }> {
  const { used, limit } = await quotaState(userId);
  if (used >= limit) {
    return {
      ok: false,
      status: 429,
      error: "quota_exhausted",
      message: `Daily generation limit reached (${used}/${limit} today). Try again tomorrow.`,
    };
  }
  return { ok: true, used, limit };
}

/**
 * Run a full generation for a repo. Never throws — failures are recorded on
 * the generation row and returned as a structured outcome.
 */
export async function runGeneration(repoId: string, triggeredBy: "manual" | "webhook" = "manual"): Promise<GenerationOutcome> {
  const [repo] = await db.select().from(repos).where(eq(repos.id, repoId)).limit(1);
  if (!repo) return { ok: false, status: 404, error: "not_found", message: "Repo not found." };
  if (repo.status !== "active") {
    return { ok: false, status: 409, error: "repo_not_active", message: `Repo is ${repo.status}; activate it first.` };
  }

  const [gen] = await db
    .insert(generations)
    .values({ repoId: repo.id, status: "processing", triggeredBy, startedAt: new Date() })
    .returning({ id: generations.id });

  try {
    // 1. Fetch (read-only installation token; contents stay in memory).
    const tree = await fetchRepoTree(repo.installationId, repo.owner, repo.name, repo.defaultBranch);
    if (tree.truncated) throw new Error("Repository tree too large to index (GitHub truncated the listing).");

    const candidates = tree.entries
      .filter((e) => e.type === "blob" && /(^|\/)route\.(ts|tsx)$/.test(e.path) && (e.size ?? 0) <= MAX_FILE_BYTES)
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, MAX_FILES);

    // 2. AST parse — structural facts come from the compiler, never the LLM.
    const contents: { path: string; content: string }[] = [];
    for (const c of candidates) {
      const content = await fetchRepoBlob(repo.installationId, repo.owner, repo.name, c.path, repo.defaultBranch);
      if (content !== null) contents.push({ path: c.path, content });
    }
    const routes = parseRouteFiles(contents);

    // 3. AI writes prose for the parsed facts only (stub without API key).
    let descriptions = new Map<string, string>();
    let tokensUsed = 0;
    if (routes.length > 0 && aiEnabled()) {
      const result = await describeRoutes(routes);
      descriptions = result.descriptions;
      tokensUsed = result.tokensUsed;
    }

    // 4. Markdown from facts + prose; stored as a draft until published.
    const markdown = buildApiMarkdown(repo.githubRepoFullName, repo.defaultBranch, routes, descriptions);

    const [updated] = await db
      .update(generations)
      .set({
        status: "success",
        tokensUsed: tokensUsed || null,
        completedAt: new Date(),
        markdown,
      })
      .where(eq(generations.id, gen.id))
      .returning({ id: generations.id });

    await db
      .update(repos)
      .set({ lastGeneratedAt: new Date(), updatedAt: new Date() })
      .where(eq(repos.id, repo.id));

    await bumpQuota(repo.userId, tokensUsed);

    return { ok: true, generationId: updated.id, endpointCount: routes.length, tokensUsed, aiUsed: descriptions.size > 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown generation error";
    console.error(`Generation failed for repo ${repo.githubRepoFullName}:`, err);
    await db
      .update(generations)
      .set({ status: "failed", errorMessage: message.slice(0, 500), completedAt: new Date() })
      .where(eq(generations.id, gen.id));
    return { ok: false, status: 502, error: "generation_failed", message };
  }
}
