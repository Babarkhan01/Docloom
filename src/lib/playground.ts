import {
  detectUnsupportedFramework,
  parseRouteFilesCrossFile,
  parseRouteFilesWithDiagnostics,
  schemaImportCandidates,
} from "./route-parser";
import { buildApiMarkdown, routeKey, type GenerationCoverage } from "./docs";
import { rateLimit, dailyCount, bumpDailyCount } from "./rate-limit";
import { aiEnabled, describeRoutes } from "./ai";
import type { ParsedRoute } from "./route-parser";

/**
 * Playground: no-signup docs generation for PUBLIC GitHub repos.
 *
 * The conversion path for the launch: paste a repo URL → AST-verified docs in
 * ~a minute → "sign in to save & publish". Deliberate constraints:
 *
 * - Public data only, through GitHub's public REST API — never the GitHub App
 *   installation tokens, never OAuth. Private repos are refused with the
 *   Pro pitch instead.
 * - No DB: the pipeline is the same pure parser + markdown builder the
 *   demo scripts prove offline (scripts/generate-demo-docs.mjs). Nothing is
 *   persisted — source is processed in memory and dropped (project principle).
 *   Descriptions come from the LLM when one is configured (LLM_PROVIDER),
 *   capped at the first PLAYGROUND_LLM_ROUTES_MAX routes per run and wrapped
 *   in a per-UTC-day request budget; any LLM failure falls back to the
 *   JSDoc/AST prose instead of failing the request.
 * - Bounded spend: per-IP daily + burst rate limits, a global hourly run cap
 *   (tight when PLAYGROUND_GITHUB_TOKEN is unset — GitHub's anonymous limit is
 *   the real ceiling), a concurrency guard, and per-run file/size caps sized
 *   to stay inside the Workers subrequest budget (≤42 of 50).
 */

const GITHUB_API = "https://api.github.com";

const GH_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "docloom",
};

// ---------------------------------------------------------------------------
// Repo input parsing — owner/repo pairs and github.com URLs
// ---------------------------------------------------------------------------

export type ParsedRepoInput = { owner: string; repo: string; ref: string | null };

/** Rejects empty, ".", "..", and anything outside [A-Za-z0-9_.-] (blocks URL path tricks via encodeURIComponent). */
export function safeSegment(s: string): boolean {
  return s.length > 0 && s.length <= 100 && s !== "." && s !== ".." && /^[A-Za-z0-9_.-]+$/.test(s);
}

/** Branch/tag names may contain slashes; reject dot-segments that could escape the ref path. */
export function safeRef(s: string): boolean {
  return s.length > 0 && s.length <= 200 && /^[A-Za-z0-9._\-/]+$/.test(s) && !/(^|\/)\.\.?(?=\/|$)/.test(s);
}

/**
 * Accept "owner/repo", "github.com/owner/repo", and the tree-URL form
 * "github.com/owner/repo/tree/branch". Returns null for anything else.
 */
export function parseRepoInput(raw: string): ParsedRepoInput | null {
  let s = raw.trim();
  if (!s) return null;
  s = s
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+$/, "") // strip trailing slash first so `o/r.git/` can match `.git`
    .replace(/\.git$/i, "");

  const m = /^(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/tree\/(.+))?$/i.exec(s);
  if (!m) return null;
  const [, owner, repo, ref] = m;
  if (!safeSegment(owner) || !safeSegment(repo)) return null;
  if (ref !== undefined && !safeRef(ref)) return null;
  return { owner, repo, ref: ref ?? null };
}

// ---------------------------------------------------------------------------
// GitHub public API (anonymous, or an optional PAT via PLAYGROUND_GITHUB_TOKEN)
// ---------------------------------------------------------------------------

export class PublicGitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "PublicGitHubError";
  }
}

export async function publicGithubFetch<T>(path: string): Promise<T> {
  const token = process.env.PLAYGROUND_GITHUB_TOKEN || "";
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: { ...GH_HEADERS, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    let message = `GitHub API error ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string };
      message = body.message ?? message;
    } catch {
      // keep default message
    }
    throw new PublicGitHubError(res.status, message);
  }
  return (await res.json()) as T;
}

export type PlaygroundRepoMeta = {
  fullName: string;
  owner: string;
  name: string;
  isPrivate: boolean;
  defaultBranch: string;
};

export async function fetchPublicRepoMeta(owner: string, name: string): Promise<PlaygroundRepoMeta> {
  const data = await publicGithubFetch<{
    full_name: string;
    name: string;
    private: boolean;
    default_branch: string | null;
    owner: { login: string } | null;
  }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
  return {
    fullName: data.full_name,
    owner: data.owner?.login ?? owner,
    name: data.name ?? name,
    isPrivate: data.private === true,
    defaultBranch: data.default_branch || "main",
  };
}

export type PublicTreeEntry = { path: string; type: "blob" | "tree"; size: number | null };

export async function fetchPublicTree(
  owner: string,
  name: string,
  ref: string,
): Promise<{ entries: PublicTreeEntry[]; truncated: boolean; treeSha: string | null }> {
  const data = await publicGithubFetch<{
    sha?: string;
    tree?: { path: string; type: string; size?: number }[];
    truncated?: boolean;
  }>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  return {
    entries: (data.tree ?? []).map((e) => ({
      path: e.path,
      type: e.type === "tree" ? "tree" : "blob",
      size: e.size ?? null,
    })),
    truncated: data.truncated === true,
    // Content identity of the snapshot — the description-cache key component
    // that guarantees a cached description is for exactly this source state.
    treeSha: data.sha ?? null,
  };
}

/** Fetch one file at a ref. Null when unreadable (missing, moved, too big for the API) — one bad file never fails a run. */
export async function fetchPublicBlob(
  owner: string,
  name: string,
  ref: string,
  filePath: string,
): Promise<string | null> {
  try {
    const data = await publicGithubFetch<{ content?: string; encoding?: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${filePath
        .split("/")
        .map(encodeURIComponent)
        .join("/")}?ref=${encodeURIComponent(ref)}`,
    );
    if (!data.content || data.encoding !== "base64") return null;
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Caps — every one env-overridable, defaults sized for Workers Free
// ---------------------------------------------------------------------------

export type PlaygroundLimits = {
  maxFiles: number;
  maxFileBytes: number;
  schemaFetchBudget: number;
  entryCap: number;
  maxMarkdownBytes: number;
  dailyIpLimit: number;
  hourlyRunCap: number;
  concurrency: number;
  /** Routes per run sent to the LLM — the rest keep JSDoc/AST fallback prose. */
  llmRoutesMax: number;
  /** Routes per describeRoutes call — sized so one batch ≈ ≤4K tokens (8K TPM budget). */
  llmBatchRoutes: number;
  /** Global per-UTC-day cap on playground LLM calls (batches), all IPs combined. */
  llmDailyMax: number;
};

function envInt(key: string, def: number, min: number, max: number): number {
  const raw = Number(process.env[key]);
  if (!Number.isFinite(raw) || raw < min) return def;
  return Math.min(Math.floor(raw), max);
}

export function playgroundLimits(): PlaygroundLimits {
  const hasToken = Boolean(process.env.PLAYGROUND_GITHUB_TOKEN);
  return {
    maxFiles: envInt("PLAYGROUND_MAX_FILES", 25, 1, 50),
    maxFileBytes: envInt("PLAYGROUND_MAX_FILE_BYTES", 64 * 1024, 1024, 1024 * 1024),
    schemaFetchBudget: envInt("PLAYGROUND_SCHEMA_FETCH_BUDGET", 10, 0, 25),
    entryCap: envInt("PLAYGROUND_TREE_ENTRY_CAP", 20_000, 100, 100_000),
    maxMarkdownBytes: envInt("PLAYGROUND_MAX_MARKDOWN_BYTES", 3_000_000, 10_000, 10_000_000),
    dailyIpLimit: envInt("PLAYGROUND_DAILY_IP_LIMIT", 5, 1, 100),
    // With a token (5,000 req/h) a run's ~42 calls allows dozens of runs per
    // hour; anonymously GitHub allows 60 req/h — about one run. The optional
    // PAT is effectively required for real traffic.
    hourlyRunCap: envInt("PLAYGROUND_HOURLY_RUN_CAP", hasToken ? 60 : 1, 1, 10_000),
    concurrency: envInt("PLAYGROUND_CONCURRENCY", 2, 1, 10),
    // 20 routes ≈ 8K tokens at the measured ~400 tok/route — exactly the
    // groq free-tier TPM budget, so one run can never crowd out a minute's
    // whole allowance on its own.
    llmRoutesMax: envInt("PLAYGROUND_LLM_ROUTES_MAX", 20, 0, 50),
    llmBatchRoutes: envInt("PLAYGROUND_LLM_BATCH_ROUTES", 10, 1, 20),
    llmDailyMax: envInt("PLAYGROUND_LLM_DAILY_MAX", 300, 1, 100_000),
    // The entry cap is the durable limit that keeps a single run from trying to
    // parse a monorepo the size of Next.js. It is intentionally generously
    // sized (defaults 20,000 files) so that real multi-package repos still
    // document some endpoints, but it will reject truly enormous repos with a
    // clear, named message rather than a near-silent partial parse.
    //
    // If you want Next.js-sized repos to work in the playground and you have a
    // token, raise PLAYGROUND_TREE_ENTRY_CAP. Expect the run to spend on the
    // order of the cap's worth of GitHub API calls, so it also counts against
    // the hourly run cap — which is why raising the cap without raising the run
    // cap (or providing a token) creates "busy" errors, not faster runs.
  };
}

// ---------------------------------------------------------------------------
// Global capacity — hourly run cap + concurrency guard (per isolate; the
// per-IP daily limit below is the durable backstop, rate-limit.ts)
// ---------------------------------------------------------------------------

let inFlight = 0;
let hourBucket = "";
let hourUsed = 0;

function hourKeyOf(now: number): string {
  return new Date(now).toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

export function acquirePlaygroundSlot(
  now: number = Date.now(),
): { ok: true; release: () => void } | { ok: false; retryAfterSeconds: number } {
  const limits = playgroundLimits();
  const key = hourKeyOf(now);
  if (key !== hourBucket) {
    hourBucket = key;
    hourUsed = 0;
  }
  if (hourUsed >= limits.hourlyRunCap) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((3_600_000 - (now % 3_600_000)) / 1000)) };
  }
  if (inFlight >= limits.concurrency) {
    return { ok: false, retryAfterSeconds: 10 };
  }
  inFlight += 1;
  hourUsed += 1;
  let released = false;
  return {
    ok: true,
    release() {
      if (!released) {
        released = true;
        inFlight = Math.max(0, inFlight - 1);
      }
    },
  };
}

/** Test seam — module state must not leak between tests. */
export function __resetPlaygroundCapacityForTests(): void {
  inFlight = 0;
  hourBucket = "";
  hourUsed = 0;
}

/** Test seam — the description cache must not leak between tests either. */
export function __resetDescriptionCacheForTests(): void {
  descCache.clear();
}

// ---------------------------------------------------------------------------
// Markdown size cap — a huge repo's docs are truncated with a named note,
// never silently and never by dropping the honest-coverage header.
// ---------------------------------------------------------------------------

export function applyMarkdownCap(markdown: string, maxBytes: number): { markdown: string; truncated: boolean } {
  if (Buffer.byteLength(markdown, "utf8") <= maxBytes) return { markdown, truncated: false };
  const sliced = Buffer.from(markdown, "utf8").subarray(0, maxBytes).toString("utf8");
  return {
    markdown: `${sliced}\n\n> **Note:** this output was truncated to fit the playground — connect the repo to Docloom for the complete document.\n`,
    truncated: true,
  };
}

// ---------------------------------------------------------------------------
// The pipeline — mirrors executePipeline's parse logic, minus DB/AI/installation
// tokens. Injectable I/O so tests drive it without network.
// ---------------------------------------------------------------------------

export type PlaygroundIo = {
  fetchMeta: typeof fetchPublicRepoMeta;
  fetchTree: typeof fetchPublicTree;
  fetchBlob: typeof fetchPublicBlob;
  parseRouteFiles: typeof parseRouteFilesWithDiagnostics;
  parseRouteFilesCrossFile: typeof parseRouteFilesCrossFile;
  /** Injectable so tests can count LLM calls / drive failures without network. */
  aiEnabled: typeof aiEnabled;
  describeRoutes: typeof describeRoutes;
};

export const defaultIo: PlaygroundIo = {
  fetchMeta: fetchPublicRepoMeta,
  fetchTree: fetchPublicTree,
  fetchBlob: fetchPublicBlob,
  parseRouteFiles: parseRouteFilesWithDiagnostics,
  parseRouteFilesCrossFile: parseRouteFilesCrossFile,
  aiEnabled,
  describeRoutes,
};

// ---------------------------------------------------------------------------
// Description cache + LLM budget plumbing
// ---------------------------------------------------------------------------

const LLM_BUDGET_KEY = "playground:llm:daily";
const BATCH_PAUSE_MS = 2_000; // between batches; the gateway handles 429 Retry-After
const DESC_CACHE_MAX = 2_000; // evict-oldest; descriptions are small strings
const descCache = new Map<string, string>();

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function cachePut(key: string, description: string): void {
  if (descCache.size >= DESC_CACHE_MAX) {
    const oldest = descCache.keys().next().value;
    if (oldest !== undefined) descCache.delete(oldest);
  }
  descCache.set(key, description);
}

/**
 * Cache key for one route's description: content identity of everything the
 * prose was grounded on — repo, tree SHA (source snapshot), and the parsed
 * facts signature. Any fact change → miss → a fresh LLM call.
 */
async function descCacheKey(repoFullName: string, treeSha: string | null, r: ParsedRoute): Promise<string> {
  const sig = [
    r.method ?? "?",
    r.routePath,
    r.filePath,
    (r.params ?? []).map((p) => `${p.name}:${p.typeResolved ? p.type : "?"}`).join(","),
    r.requestBody
      ? r.requestBody.resolved
        ? r.requestBody.fields.map((f) => `${f.name}:${f.type}`).join(",")
        : "unresolved"
      : "none",
    (r.responses ?? [])
      .map((s) => `${s.status ?? "?"}:${s.resolved ? s.fields.map((f) => f.name).join("+") : "?"}`)
      .join(";"),
    (r.inputs ?? [])
      .map((i) => `${i.kind}:${i.nameResolved ? i.name : "?"}:${i.typed && i.typeResolved ? i.type : "?"}`)
      .join(","),
    r.jsdoc ?? "",
  ].join("|");
  return sha256Hex(`${repoFullName}|${treeSha ?? "unknown-ref"}|${sig}`);
}

/** SHA-256 over Web Crypto — available on both Node and Cloudflare Workers. */
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Health surfacing (boolean only): true when the playground's global daily
 * LLM budget is exhausted, so playground runs are in non-AI fallback.
 */
export function playgroundLlmFallback(): boolean {
  return dailyCount(LLM_BUDGET_KEY).count >= playgroundLimits().llmDailyMax;
}

export type PlaygroundRunMeta = {
  repo: string;
  branch: string;
  endpointCount: number;
  filesScanned: number;
  filesSkipped: number;
  crossFileSchemas: number;
  framework: string | null;
  truncated: boolean;
};

export type PlaygroundResult = { markdown: string; meta: PlaygroundRunMeta };
export type PlaygroundFailure = { status: number; error: string; message: string };

function githubFailure(err: PublicGitHubError, what: string): PlaygroundFailure {
  if (err.status === 404) {
    return {
      status: 404,
      error: "repo_not_found",
      message: `${what} wasn't found as a public repository — check the spelling, or it may be private.`,
    };
  }
  if (err.status === 403) {
    return {
      status: 429,
      error: "github_rate_limited",
      message: "GitHub is rate-limiting the playground right now — please try again in a few minutes.",
    };
  }
  return { status: 502, error: "github_error", message: err.message };
}

export async function runPlaygroundGeneration(
  input: { owner: string; repo: string; ref: string | null },
  io: PlaygroundIo = defaultIo,
  limits: PlaygroundLimits = playgroundLimits(),
): Promise<PlaygroundResult | PlaygroundFailure> {
  let meta: PlaygroundRepoMeta;
  try {
    meta = await io.fetchMeta(input.owner, input.repo);
  } catch (err) {
    if (err instanceof PublicGitHubError) return githubFailure(err, `${input.owner}/${input.repo}`);
    throw err;
  }
  if (meta.isPrivate) {
    return {
      status: 403,
      error: "repo_not_public",
      message: `${meta.fullName} is a private repository. The playground only handles public repos — sign in and connect it instead; private repos are exactly what the Pro plan is for.`,
    };
  }
  const ref = input.ref ?? meta.defaultBranch;

  let tree: { entries: PublicTreeEntry[]; truncated: boolean; treeSha: string | null };
  try {
    tree = await io.fetchTree(meta.owner, meta.name, ref);
  } catch (err) {
    if (err instanceof PublicGitHubError) {
      if (err.status === 404) {
        return {
          status: 404,
          error: "branch_not_found",
          message: `Branch or tag "${ref}" wasn't found in ${meta.fullName}.`,
        };
      }
      return githubFailure(err, meta.fullName);
    }
    throw err;
  }
  if (tree.truncated || tree.entries.length > limits.entryCap) {
    return {
      status: 413,
      error: "repo_too_large",
      message: `${meta.fullName} is too large for the playground (${tree.entries.length.toLocaleString()} files). Sign in and connect it — connected repos use the full pipeline.`,
    };
  }

  // Safety guard against runaway GitHub repo sizes that nobody can actually
  // parse in the playground regardless of your caps: a repo with an enormous
  // file count is a repository problem, not a docs problem. Name it clearly
  // rather than silently falling back to "too many files scanned".
  if (tree.entries.length > 500_000) {
    return {
      status: 413,
      error: "repo_exceptionally_large",
      message: `${meta.fullName} is an extremely large repository (${tree.entries.length.toLocaleString()} files) — beyond what any single playground run can parse. Sign in and connect it if you need the docs; otherwise try a smaller owner/repo pair or a subdirectory-scoped public repo mirror.`,
    };
  }

  // Candidate selection — same rules as executePipeline: App Router route.ts(x)
  // files within the size cap, sorted, capped. Skips are counted honestly and
  // end up in the coverage note so the docs never look more complete than they are.
  const entries = tree.entries;
  const routeFilesJs = entries.filter(
    (e) => e.type === "blob" && /(^|\/)route\.(js|jsx)$/.test(e.path),
  ).length;
  const tooLarge = entries.filter(
    (e) =>
      e.type === "blob" &&
      /(^|\/)route\.(ts|tsx)$/.test(e.path) &&
      (e.size ?? 0) > limits.maxFileBytes,
  ).length;
  const eligible = entries
    .filter(
      (e) =>
        e.type === "blob" &&
        /(^|\/)route\.(ts|tsx)$/.test(e.path) &&
        (e.size ?? 0) <= limits.maxFileBytes,
    )
    .sort((a, b) => a.path.localeCompare(b.path));
  const candidates = eligible.slice(0, limits.maxFiles);

  const contents: { path: string; content: string }[] = [];
  for (const c of candidates) {
    const content = await io.fetchBlob(meta.owner, meta.name, ref, c.path);
    if (content !== null) contents.push({ path: c.path, content });
  }

  let { routes, diagnostics } = io.parseRouteFiles(contents);

  // Cross-file schema resolution (M2), on the same bounded budget as the
  // product pipeline. Package-import gaps are never fetched.
  let crossFileSchemas = 0;
  const fetchable = schemaImportCandidates(routes);
  const fetchCount = fetchable.reduce((n, f) => n + f.candidatePaths.length, 0);
  if (fetchable.length > 0 && fetchCount <= limits.schemaFetchBudget) {
    const treePaths = new Set(entries.map((e) => e.path));
    const extra: { path: string; content: string }[] = [];
    let spent = 0;
    for (const f of fetchable) {
      for (const p of f.candidatePaths) {
        if (spent >= limits.schemaFetchBudget) break;
        if (contents.some((c) => c.path === p)) continue;
        if (!treePaths.has(p)) continue;
        const content = await io.fetchBlob(meta.owner, meta.name, ref, p);
        spent += 1;
        if (content !== null && Buffer.byteLength(content, "utf8") <= limits.maxFileBytes) {
          extra.push({ path: p, content });
        }
      }
    }
    if (extra.length > 0) {
      const round2 = io.parseRouteFilesCrossFile(contents, extra);
      routes = round2.routes;
      diagnostics = round2.diagnostics;
      crossFileSchemas = extra.length;
    }
  }

  // Empty parse → honestly name an unsupported framework when one is detectable
  // (same sampling approach as the product pipeline, ≤5 extra fetches).
  let unsupportedFramework: string | null = null;
  if (routes.length === 0) {
    const candidateSet = new Set(candidates.map((c) => c.path));
    const samplePaths = entries
      .filter(
        (e) =>
          e.type === "blob" &&
          /(^|\/)(server|app|main|index)\.(ts|js|mjs|cjs)$/.test(e.path) &&
          !e.path.includes("node_modules") &&
          (e.size ?? 0) <= limits.maxFileBytes &&
          !candidateSet.has(e.path),
      )
      .slice(0, 5)
      .map((e) => e.path);
    const sample: { path: string; content: string }[] = [...contents];
    for (const p of samplePaths) {
      const content = await io.fetchBlob(meta.owner, meta.name, ref, p);
      if (content !== null) sample.push({ path: p, content });
    }
    unsupportedFramework = detectUnsupportedFramework(sample);
  }

  let coverage: GenerationCoverage | undefined =
    eligible.length > candidates.length || tooLarge > 0 || routeFilesJs > 0
      ? {
          filesSkipped: eligible.length - candidates.length,
          fileCap: limits.maxFiles,
          filesTooLarge: tooLarge,
          filesExcludedOther: routeFilesJs,
        }
      : undefined;
  if (coverage) {
    coverage.filesWithOpaqueHandlers = new Set(diagnostics.wrappedOpaque.map((d) => d.filePath)).size;
    coverage.opaqueHandlers = diagnostics.wrappedOpaque;
  }
  if (unsupportedFramework && coverage) coverage.unsupportedFramework = unsupportedFramework;
  if (unsupportedFramework && !coverage) {
    coverage = { filesSkipped: 0, fileCap: limits.maxFiles, unsupportedFramework };
  }

  // ---------------------------------------------------------------------------
  // AI prose over the AST facts — budgeted, paced, and failure-tolerant:
  //
  // - Scope: the FIRST llmRoutesMax (default 20) routes; the rest keep the
  //   JSDoc/AST fallback prose (the note says exactly that).
  // - Batches of llmBatchRoutes (default 10 ≈ 4K tokens) so a 20-route run
  //   spends ≤8K tokens — the groq free-tier TPM budget — and a 2s pause
  //   between batches keeps two runs in a minute inside it too.
  // - The gateway already retries 429/5xx honoring Retry-After; a batch that
  //   still fails degrades to JSDoc for itself only — the request returns
  //   HTTP 200 with structural output, never an LLM error.
  // - Cache: descriptions keyed by repo + tree SHA + route signature. Repeat
  //   hits on an unchanged repo cost zero LLM calls and zero daily budget.
  // - Global guard: llmDailyMax (default 300) playground LLM calls per UTC
  //   day protect the shared Groq org limits for the signed-in flows.
  // ---------------------------------------------------------------------------
  const descriptions = new Map<string, string>();
  let aiFor: number | undefined;
  let aiOf: number | undefined;
  let aiSkipped: "llm-budget" | "llm-unavailable" | undefined;

  if (routes.length > 0 && io.aiEnabled()) {
    if (limits.llmRoutesMax > 0) {
      const scoped = routes.slice(0, limits.llmRoutesMax);
      aiOf = scoped.length;
      const batches = chunk(scoped, limits.llmBatchRoutes);
      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const uncached: ParsedRoute[] = [];
        for (const r of batch) {
          const key = await descCacheKey(meta.fullName, tree.treeSha, r);
          const hit = descCache.get(key);
          if (hit !== undefined) descriptions.set(routeKey(r), hit);
          else uncached.push(r);
        }
        if (uncached.length > 0) {
          if (dailyCount(LLM_BUDGET_KEY).count >= limits.llmDailyMax) {
            aiSkipped = "llm-budget";
            break; // remaining batches fall back silently (still counted below)
          }
          bumpDailyCount(LLM_BUDGET_KEY);
          try {
            const res = await io.describeRoutes(uncached, /* repoPublic */ true);
            for (const [k, v] of res.descriptions) {
              descriptions.set(k, v);
              const r = uncached.find((x) => routeKey(x) === k);
              if (r) cachePut(await descCacheKey(meta.fullName, tree.treeSha, r), v);
            }
          } catch {
            // This batch keeps its JSDoc/AST prose; later batches still try.
          }
          if (b < batches.length - 1) await sleep(BATCH_PAUSE_MS);
        }
      }
      aiFor = descriptions.size > 0 ? descriptions.size : undefined;
      if (descriptions.size === 0 && !aiSkipped) aiSkipped = "llm-unavailable";
      aiOf = routes.length; // the note references the whole document, not just the scope
    }
    // llmRoutesMax === 0 is an explicit operator choice to disable playground
    // AI entirely — that needs no coverage note.
  }

  if (aiFor !== undefined && aiOf !== undefined) {
    coverage = {
      ...(coverage ?? { filesSkipped: eligible.length - candidates.length, fileCap: limits.maxFiles }),
      aiFor,
      aiOf,
      ...(aiSkipped ? { aiSkipped } : {}),
    };
  } else if (aiSkipped) {
    coverage = {
      ...(coverage ?? { filesSkipped: eligible.length - candidates.length, fileCap: limits.maxFiles }),
      aiSkipped,
    };
  }

  const raw = buildApiMarkdown(meta.fullName, ref, routes, descriptions, coverage);
  const capped = applyMarkdownCap(raw, limits.maxMarkdownBytes);

  return {
    markdown: capped.markdown,
    meta: {
      repo: meta.fullName,
      branch: ref,
      endpointCount: routes.length,
      filesScanned: contents.length,
      filesSkipped: eligible.length - candidates.length,
      crossFileSchemas,
      framework: unsupportedFramework,
      truncated: capped.truncated,
    },
  };
}

// ---------------------------------------------------------------------------
// Per-IP limits used by the route (exported so the route stays thin)
// ---------------------------------------------------------------------------

export function playgroundBurstLimit(ip: string): ReturnType<typeof rateLimit> {
  return rateLimit(`playground:burst:${ip}`, { max: 3, windowMs: 60_000 });
}

export function playgroundDailyLimit(ip: string, dailyIpLimit: number): ReturnType<typeof rateLimit> {
  return rateLimit(`playground:daily:${ip}`, { max: dailyIpLimit, windowMs: 24 * 60 * 60 * 1000 });
}
