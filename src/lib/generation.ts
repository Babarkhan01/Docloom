import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { generations, repos, usageCounters, users } from "./schema";
import { fetchRepoBlob, fetchRepoTree } from "./github";
import {
  parseRouteFilesWithDiagnostics,
  parseRouteFilesCrossFile,
  detectUnsupportedFramework,
  schemaImportCandidates,
} from "./route-parser";
import { aiEnabled, describeRoutes } from "./ai";
import { buildApiMarkdown, type GenerationCoverage } from "./docs";
import { dailyGenerationLimitFor, effectivePlan, type Plan } from "./billing";

/**
 * Generation pipeline: fetch (read-only installation token) → AST parse →
 * AI prose over facts → markdown. Source code is processed in memory and
 * never persisted (project principle).
 *
 * Two entry points share one pipeline:
 * - runGeneration (manual): synchronous, inserts its own processing row.
 * - runQueuedGeneration (webhook/cron): claims an existing `queued` row
 *   atomically, re-checks quota, and runs with a reduced file cap so the
 *   whole run fits in a Workers invocation's subrequest budget. It can never
 *   publish: nothing here writes publishedAt / publishedGenerationId — the
 *   user approves drafts from the dashboard.
 */

const MAX_FILES = 50;
const MAX_FILE_BYTES = 64 * 1024;
/**
 * Extra blob fetches allowed for cross-file schema resolution (M2): imported
 * zod schema files fetched after the first parse pass. Bounded so a run's
 * total (1 tree + ≤maxFiles route blobs + ≤SCHEMA_FETCH_BUDGET extra + AI + DB)
 * stays inside the Workers subrequest budget.
 */
const SCHEMA_FETCH_BUDGET = 25;
/** Cap on imported-schema file size (same rationale as MAX_FILE_BYTES). */
const MAX_SCHEMA_FILE_BYTES = 64 * 1024;

/** File cap for webhook-triggered runs (Workers Free: 50 subrequests/invocation; a run ≈ 1 tree + N blobs + AI + DB). */
export function webhookMaxFiles(): number {
  const n = Number(process.env.DOCLOOM_WEBHOOK_MAX_FILES ?? 20);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_FILES) : 20;
}

/** Max queued runs a single cron tick drives (each run costs ~30 subrequests). */
export function cronMaxRuns(): number {
  const n = Number(process.env.DOCLOOM_CRON_MAX_RUNS ?? 1);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export type GenerationOutcome =
  | { ok: true; generationId: string; endpointCount: number; tokensUsed: number; aiUsed: boolean }
  | { ok: false; status: number; error: string; message: string };

export type SkippedClaim =
  | { claimed: false; reason: "not_found" | "not_queued" }
  | { claimed: true };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Daily cap for this user — plan-aware (Free 5 / Starter 25 / Team 100) via billing.ts. */
export async function quotaStateFor(userId: string) {
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, today())))
    .limit(1);
  const [user] = await db
    .select({ plan: users.plan, dodoSubscriptionStatus: users.dodoSubscriptionStatus, dodoGraceUntil: users.dodoGraceUntil })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const plan = effectivePlan({
    plan: user?.plan ?? null,
    dodoSubscriptionStatus: user?.dodoSubscriptionStatus ?? null,
    dodoGraceUntil: user?.dodoGraceUntil ?? null,
  });
  return {
    used: row?.generationsCount ?? 0,
    limit: dailyGenerationLimitFor(plan),
    plan,
  };
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

/**
 * Quota check for the generate route; returns a 429-shaped outcome when
 * exhausted. The message names the concrete benefit the next tier unlocks.
 */
export async function checkQuota(
  userId: string,
): Promise<
  | { ok: true; used: number; limit: number }
  | { ok: false; status: number; error: string; message: string; upgradeTo: "starter" | "team" | null }
> {
  const { used, limit, plan } = await quotaStateFor(userId);
  if (used >= limit) {
    return {
      ok: false,
      status: 429,
      error: "quota_exhausted",
      upgradeTo: upgradeToForPlan(plan),
      message: quotaMessage(plan, used, limit),
    };
  }
  return { ok: true, used, limit };
}

function upgradeToForPlan(plan: Plan): "starter" | "team" | null {
  return plan === "free" ? "starter" : plan === "starter" ? "team" : null;
}

function quotaMessage(plan: Plan, used: number, limit: number): string {
  if (plan === "team") {
    return `Daily generation limit reached (${used}/${limit} today). Try again tomorrow.`;
  }
  const next = plan === "free" ? "Starter" : "Team";
  const nextLimit = dailyGenerationLimitFor(next === "Starter" ? "starter" : "team");
  return `Daily generation limit reached (${used}/${limit} today). ${next} raises this to ${nextLimit}/day${
    plan === "free"
      ? " and unlocks private repos, 5 repos, and auto-regenerate on merge"
      : " and 20 repos"
  }.`;
}

// ---------------------------------------------------------------------------
// Injectable seams — the pipeline's I/O and persistence, so tests can drive
// failure/success paths with fakes. Production always uses the defaults.
// ---------------------------------------------------------------------------

export type PipelineIo = {
  fetchTree: typeof fetchRepoTree;
  fetchBlob: typeof fetchRepoBlob;
  /** Parses fetched route files; returns routes + unresolvable-handler diagnostics. */
  parseRouteFiles: typeof parseRouteFilesWithDiagnostics;
  /** Re-parses with cross-file schema resolution (M2); same result shape. */
  parseRouteFilesCrossFile: typeof parseRouteFilesCrossFile;
  aiEnabled: typeof aiEnabled;
  describeRoutes: typeof describeRoutes;
};

const defaultIo: PipelineIo = {
  fetchTree: fetchRepoTree,
  fetchBlob: fetchRepoBlob,
  parseRouteFiles: parseRouteFilesWithDiagnostics,
  parseRouteFilesCrossFile: parseRouteFilesCrossFile,
  aiEnabled: aiEnabled,
  describeRoutes: describeRoutes,
};

/**
 * The persistence the pipeline is allowed to do. Note what is NOT here: no
 * way to write publishedAt or publishedGenerationId — a run (manual or
 * queued) structurally cannot publish or disturb the published docs.
 */
export type GenerationStore = {
  updateGeneration(
    id: string,
    patch: {
      status?: "queued" | "processing" | "success" | "failed";
      tokensUsed?: number | null;
      completedAt?: Date | null;
      errorMessage?: string | null;
      markdown?: string | null;
    },
  ): Promise<void>;
  updateRepo(
    repoId: string,
    patch: { lastGeneratedAt?: Date; updatedAt?: Date },
  ): Promise<void>;
  addQuota(userId: string, tokens: number): Promise<void>;
};

const defaultStore: GenerationStore = {
  async updateGeneration(id, patch) {
    await db.update(generations).set(patch).where(eq(generations.id, id));
  },
  async updateRepo(repoId, patch) {
    await db.update(repos).set(patch).where(eq(repos.id, repoId));
  },
  async addQuota(userId, tokens) {
    await bumpQuota(userId, tokens);
  },
};

type PipelineRepo = typeof repos.$inferSelect;

/**
 * Shared pipeline. Never throws — failures are recorded on the generation row
 * (status=failed + reason) and returned as a structured outcome. The
 * previously published docs are untouched in every path.
 */
export async function executePipeline(
  repo: PipelineRepo,
  generationId: string,
  opts: { maxFiles: number },
  io: PipelineIo = defaultIo,
  store: GenerationStore = defaultStore,
): Promise<GenerationOutcome> {
  try {
    // 1. Fetch (read-only installation token; contents stay in memory).
    const tree = await io.fetchTree(repo.installationId, repo.owner, repo.name, repo.defaultBranch);
    if (tree.truncated) throw new Error("Repository tree too large to index (GitHub truncated the listing).");

    // Pre-caps counts for the coverage summary (previously computed but unused):
    const routeFilesJs = tree.entries.filter(
      (e) => e.type === "blob" && /(^|\/)route\.(js|jsx)$/.test(e.path),
    ).length;
    const tooLarge = tree.entries.filter(
      (e) =>
        e.type === "blob" &&
        /(^|\/)route\.(ts|tsx)$/.test(e.path) &&
        (e.size ?? 0) > MAX_FILE_BYTES,
    ).length;

    const eligible = tree.entries
      .filter((e) => e.type === "blob" && /(^|\/)route\.(ts|tsx)$/.test(e.path) && (e.size ?? 0) <= MAX_FILE_BYTES)
      .sort((a, b) => a.path.localeCompare(b.path));
    const candidates = eligible.slice(0, opts.maxFiles);
    let coverage: GenerationCoverage | undefined =
      eligible.length > candidates.length || tooLarge > 0 || routeFilesJs > 0
        ? {
            filesSkipped: eligible.length - candidates.length,
            fileCap: opts.maxFiles,
            filesTooLarge: tooLarge,
            filesExcludedOther: routeFilesJs,
          }
        : undefined;

    // 2. AST parse — structural facts come from the compiler, never the LLM.
    // Cross-file schema resolution (M2): parse first, then spend a bounded
    // second round fetching the schema files the unresolved request bodies
    // import, and re-parse with them in the index. Repos whose schemas are all
    // same-file pay nothing; package-import gaps are never fetched.
    const contents: { path: string; content: string }[] = [];
    for (const c of candidates) {
      const content = await io.fetchBlob(repo.installationId, repo.owner, repo.name, c.path, repo.defaultBranch);
      if (content !== null) contents.push({ path: c.path, content });
    }

    let { routes, diagnostics } = io.parseRouteFiles(contents);
    const fetchable = schemaImportCandidates(routes);
    const fetchCount = fetchable.reduce((n, f) => n + f.candidatePaths.length, 0);
    if (fetchable.length > 0 && fetchCount <= SCHEMA_FETCH_BUDGET) {
      const treePaths = new Set(tree.entries.map((e) => e.path));
      const fetches: { path: string; content: string }[] = [];
      let spent = 0;
      for (const f of fetchable) {
        for (const p of f.candidatePaths) {
          if (spent >= SCHEMA_FETCH_BUDGET) break;
          if (contents.some((c) => c.path === p)) continue; // already in hand
          if (!treePaths.has(p)) continue; // not a real file in this repo
          const content = await io.fetchBlob(repo.installationId, repo.owner, repo.name, p, repo.defaultBranch);
          spent++;
          if (content !== null && Buffer.byteLength(content, "utf8") <= MAX_SCHEMA_FILE_BYTES) {
            fetches.push({ path: p, content });
          }
        }
      }
      if (fetches.length > 0) {
        const round2 = io.parseRouteFilesCrossFile(contents, fetches);
        routes = round2.routes;
        diagnostics = round2.diagnostics;
      }
    }

    // Honest unsupported-framework note (user-approved scope): when nothing
    // parsed AND the source shows Express/Fastify/NestJS registrations, say so
    // instead of a generic "no endpoints detected". On an empty parse, sample
    // a few likely entry/server files (bounded: ≤5 extra fetches, so the
    // subrequest budget still holds) and run detection on them + what we have.
    let unsupportedFramework: string | null = null;
    if (routes.length === 0) {
      const samplePaths = tree.entries
        .filter(
          (e) =>
            e.type === "blob" &&
            /(^|\/)(server|app|main|index)\.(ts|js|mjs|cjs)$/.test(e.path) &&
            !e.path.includes("node_modules") &&
            (e.size ?? 0) <= MAX_FILE_BYTES &&
            !candidates.some((c) => c.path === e.path),
        )
        .slice(0, 5)
        .map((e) => e.path);
      const sample: { path: string; content: string }[] = [...contents];
      for (const p of samplePaths) {
        const content = await io.fetchBlob(repo.installationId, repo.owner, repo.name, p, repo.defaultBranch);
        if (content !== null) sample.push({ path: p, content });
      }
      unsupportedFramework = detectUnsupportedFramework(sample);
    }
    if (coverage) {
      coverage.filesWithOpaqueHandlers = new Set(diagnostics.wrappedOpaque.map((d) => d.filePath)).size;
      coverage.opaqueHandlers = diagnostics.wrappedOpaque;
    }
    if (unsupportedFramework && coverage) coverage.unsupportedFramework = unsupportedFramework;
    if (unsupportedFramework && !coverage) {
      // No cap/size skips, but the framework note still belongs in the draft.
      coverage = { filesSkipped: 0, fileCap: opts.maxFiles, unsupportedFramework };
    }

    // 3. AI writes prose for the parsed facts only (stub without API key).
    let descriptions = new Map<string, string>();
    let tokensUsed = 0;
    if (routes.length > 0 && io.aiEnabled()) {
      const result = await io.describeRoutes(routes);
      descriptions = result.descriptions;
      tokensUsed = result.tokensUsed;
    }

    // 4. Markdown from facts + prose; stored as a draft until published.
    const markdown = buildApiMarkdown(repo.githubRepoFullName, repo.defaultBranch, routes, descriptions, coverage);

    await store.updateGeneration(generationId, {
      status: "success",
      tokensUsed: tokensUsed || null,
      completedAt: new Date(),
      markdown,
    });

    await store.updateRepo(repo.id, { lastGeneratedAt: new Date(), updatedAt: new Date() });

    await store.addQuota(repo.userId, tokensUsed);

    return { ok: true, generationId, endpointCount: routes.length, tokensUsed,  aiUsed: descriptions.size > 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown generation error";
    console.error(`Generation failed for repo ${repo.githubRepoFullName}:`, err);
    await store.updateGeneration(generationId, {
      status: "failed",
      errorMessage: message.slice(0, 500),
      completedAt: new Date(),
    });
    return { ok: false, status: 502, error: "generation_failed", message };
  }
}

/**
 * Run a full generation for a repo (manual trigger). Never throws — failures
 * are recorded on the generation row and returned as a structured outcome.
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

  return executePipeline(repo, gen.id, { maxFiles: MAX_FILES });
}

// ---------------------------------------------------------------------------
// Webhook / cron queue consumer
// ---------------------------------------------------------------------------

/**
 * Claim a queued generation atomically (queued → processing). Returns false
 * when the row is gone or another consumer already claimed it — the webhook's
 * waitUntil and the cron pinger can race safely.
 */
export async function claimQueuedGeneration(generationId: string): Promise<boolean> {
  const claimed = await db
    .update(generations)
    .set({ status: "processing", startedAt: new Date() })
    .where(and(eq(generations.id, generationId), eq(generations.status, "queued")))
    .returning({ id: generations.id });
  return claimed.length > 0;
}

/**
 * Drive one queued generation (webhook waitUntil / cron pinger). A failed run
 * is recorded on the row — the previously published docs are never touched.
 */
export async function runQueuedGeneration(
  generationId: string,
  io: PipelineIo = defaultIo,
  store: GenerationStore = defaultStore,
): Promise<GenerationOutcome | { ok: false; status: number; error: string; message: string; skipped?: true }> {
  const [row] = await db
    .select({ id: generations.id, status: generations.status, repoId: generations.repoId })
    .from(generations)
    .where(eq(generations.id, generationId))
    .limit(1);
  if (!row) return { ok: false, status: 404, error: "not_found", message: "Queued generation not found." };
  if (row.status !== "queued") {
    return { ok: false, status: 409, error: "not_queued", message: "Already claimed or finished.", skipped: true };
  }

  if (!(await claimQueuedGeneration(generationId))) {
    return { ok: false, status: 409, error: "not_queued", message: "Another consumer claimed this run.", skipped: true };
  }

  const [repo] = await db.select().from(repos).where(eq(repos.id, row.repoId)).limit(1);
  if (!repo) {
    await store.updateGeneration(generationId, {
      status: "failed",
      errorMessage: "Repo was disconnected before the queued run started.",
      completedAt: new Date(),
    });
    return { ok: false, status: 404, error: "repo_not_found", message: "Repo was disconnected before the run started." };
  }

  // Quota is re-checked at claim time: pushes are queued without spending,
  // but a run never starts over the daily cap (recorded, not silent).
  const quota = await quotaStateFor(repo.userId);
  if (quota.used >= quota.limit) {
    const message = `Auto-regenerate skipped: daily generation limit reached (${quota.used}/${quota.limit}). The next push after the daily reset will regenerate docs.`;
    await store.updateGeneration(generationId, { status: "failed", errorMessage: message.slice(0, 500), completedAt: new Date() });
    return { ok: false, status: 429, error: "quota_exhausted", message };
  }

  return executePipeline(repo, generationId, { maxFiles: webhookMaxFiles() }, io, store);
}
