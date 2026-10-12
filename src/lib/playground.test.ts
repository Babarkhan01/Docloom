import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlaygroundCapacityForTests,
  __resetDescriptionCacheForTests,
  acquirePlaygroundSlot,
  applyMarkdownCap,
  parseRepoInput,
  playgroundLimits,
  PublicGitHubError,
  runPlaygroundGeneration,
  safeRef,
  safeSegment,
  type PlaygroundIo,
  type PublicTreeEntry,
} from "./playground";
import { __resetRateLimitStoreForTests } from "./rate-limit";
import type { ParsedRoute } from "./route-parser";
import { routeKey } from "./docs";

afterEach(() => {
  vi.unstubAllEnvs();
  __resetPlaygroundCapacityForTests();
  __resetDescriptionCacheForTests();
});

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

describe("parseRepoInput", () => {
  it("accepts owner/repo, full URLs, and tree URLs with a branch", () => {
    expect(parseRepoInput("steven-tey/dub")).toEqual({ owner: "steven-tey", repo: "dub", ref: null });
    expect(parseRepoInput("https://github.com/calcom/cal.com")).toEqual({
      owner: "calcom",
      repo: "cal.com",
      ref: null,
    });
    expect(parseRepoInput("github.com/o/r/tree/develop")).toEqual({ owner: "o", repo: "r", ref: "develop" });
    expect(parseRepoInput("github.com/o/r/tree/release/v2")).toEqual({ owner: "o", repo: "r", ref: "release/v2" });
    expect(parseRepoInput("https://github.com/o/r.git/")).toEqual({ owner: "o", repo: "r", ref: null });
  });

  it("rejects non-repo input and path tricks", () => {
    expect(parseRepoInput("")).toBeNull();
    expect(parseRepoInput("just-a-repo-name")).toBeNull();
    expect(parseRepoInput("https://evil.com/o/r")).toBeNull();
    expect(parseRepoInput("o/r/../../secret")).toBeNull();
    expect(parseRepoInput("o/r/tree/..%2F..%2Fetc")).toBeNull();
    expect(parseRepoInput("../etc/passwd")).toBeNull();
    expect(parseRepoInput("o/r?tab=readme")).toBeNull();
  });
});

describe("safeSegment / safeRef", () => {
  it("rejects dot segments and over-long values", () => {
    expect(safeSegment(".")).toBe(false);
    expect(safeSegment("..")).toBe(false);
    expect(safeSegment("a".repeat(101))).toBe(false);
    expect(safeSegment("o.k-name_1")).toBe(true);
    expect(safeRef("feat/x")).toBe(true);
    expect(safeRef("a/../b")).toBe(false);
    expect(safeRef("a/./b")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Capacity guard
// ---------------------------------------------------------------------------

describe("acquirePlaygroundSlot", () => {
  beforeEach(() => {
    __resetPlaygroundCapacityForTests();
  });

  it("enforces the concurrency limit and releases slots", () => {
    vi.stubEnv("PLAYGROUND_CONCURRENCY", "1");
    vi.stubEnv("PLAYGROUND_HOURLY_RUN_CAP", "100");
    const a = acquirePlaygroundSlot();
    expect(a.ok).toBe(true);
    const b = acquirePlaygroundSlot();
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.retryAfterSeconds).toBeGreaterThan(0);
    if (a.ok) a.release();
    const c = acquirePlaygroundSlot();
    expect(c.ok).toBe(true);
    if (c.ok) c.release();
  });

  it("enforces the hourly cap and double-release is a no-op", () => {
    vi.stubEnv("PLAYGROUND_CONCURRENCY", "2");
    vi.stubEnv("PLAYGROUND_HOURLY_RUN_CAP", "2");
    const a = acquirePlaygroundSlot();
    const b = acquirePlaygroundSlot();
    expect(a.ok && b.ok).toBe(true);
    if (a.ok) a.release();
    if (a.ok) a.release(); // idempotent
    if (b.ok) b.release();

    const c = acquirePlaygroundSlot();
    expect(c.ok).toBe(false); // hour bucket still counts 2 runs this hour
    if (!c.ok) expect(c.retryAfterSeconds).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Limits + markdown cap
// ---------------------------------------------------------------------------

describe("playgroundLimits", () => {
  it("defaults the hourly cap low without a GitHub token, higher with one", () => {
    vi.stubEnv("PLAYGROUND_GITHUB_TOKEN", "");
    expect(playgroundLimits().hourlyRunCap).toBe(1);
    vi.stubEnv("PLAYGROUND_GITHUB_TOKEN", "ghp_test");
    expect(playgroundLimits().hourlyRunCap).toBe(60);
  });

  it("clamps invalid env values to safe ranges", () => {
    vi.stubEnv("PLAYGROUND_MAX_FILES", "500");
    expect(playgroundLimits().maxFiles).toBe(50);
    vi.stubEnv("PLAYGROUND_MAX_FILES", "0");
    expect(playgroundLimits().maxFiles).toBe(25);
    vi.stubEnv("PLAYGROUND_DAILY_IP_LIMIT", "-3");
    expect(playgroundLimits().dailyIpLimit).toBe(5);
  });
});

describe("applyMarkdownCap", () => {
  it("passes small markdown through untouched", () => {
    const r = applyMarkdownCap("# hi", 1000);
    expect(r).toEqual({ markdown: "# hi", truncated: false });
  });

  it("truncates oversized output with a named note", () => {
    const big = "x".repeat(20_000);
    const r = applyMarkdownCap(big, 10_000);
    expect(r.truncated).toBe(true);
    expect(r.markdown.length).toBeLessThan(big.length + 200);
    expect(r.markdown).toContain("truncated to fit the playground");
  });
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

const fakeRoute = {
  method: "GET",
  routePath: "/api/widgets",
  filePath: "app/api/widgets/route.ts",
  jsdoc: null,
  dynamicSegments: [],
  params: [],
  hasRequestUsage: false,
  returnsResponse: true,
  exportedSymbols: ["GET"],
} as unknown as ParsedRoute;

function entry(path: string, size = 100): PublicTreeEntry {
  return { path, type: "blob", size };
}

function fakeIo(opts: {
  meta?: Partial<{ isPrivate: boolean; defaultBranch: string | null; fullName: string }>;
  entries: PublicTreeEntry[];
  blobs?: Record<string, string | null>;
  routes?: ParsedRoute[];
}): PlaygroundIo & { blobPaths: string[] } {
  const blobPaths: string[] = [];
  const io: PlaygroundIo = {
    async fetchMeta() {
      return {
        fullName: opts.meta?.fullName ?? "o/r",
        owner: "o",
        name: "r",
        isPrivate: opts.meta?.isPrivate ?? false,
        defaultBranch: opts.meta?.defaultBranch ?? "main",
      };
    },
    async fetchTree() {
      return { entries: opts.entries, truncated: false, treeSha: null };
    },
    async fetchBlob(_owner: string, _name: string, _ref: string, path: string) {
      blobPaths.push(path);
      return opts.blobs?.[path] ?? null;
    },
    parseRouteFiles: (files: { path: string; content: string }[]) => ({
      routes:
        opts.routes ??
        files.map(
          (f, i) => ({ ...fakeRoute, filePath: f.path, routePath: `/api/f${i}` }) as ParsedRoute,
        ),
      diagnostics: { wrappedOpaque: [] },
    }),
    parseRouteFilesCrossFile: (
      files: { path: string; content: string }[],
      extra: { path: string; content: string }[],
    ) => ({
      routes:
        opts.routes ??
        files.map(
          (f, i) => ({ ...fakeRoute, filePath: f.path, routePath: `/api/f${i}` }) as ParsedRoute,
        ),
      diagnostics: { wrappedOpaque: [] },
      extraFiles: extra.length,
    }),
    // Default: AI off and never called — each AI test overrides explicitly.
    aiEnabled: () => false,
    describeRoutes: async () => {
      throw new Error("describeRoutes called while AI disabled");
    },
  };
  return Object.assign(io, { blobPaths });
}

describe("runPlaygroundGeneration", () => {
  const limits = playgroundLimits();

  it("refuses private repos with the Pro pitch", async () => {
    const io = fakeIo({ meta: { isPrivate: true }, entries: [] });
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, limits);
    expect(res).toMatchObject({ status: 403, error: "repo_not_public" });
    expect(res).toHaveProperty("message");
    if ("message" in res) expect(res.message).toContain("Pro plan");
  });

  it("refuses oversized repos before fetching any blobs", async () => {
    const io = fakeIo({ entries: Array.from({ length: 30_000 }, (_, i) => entry(`f${i}.ts`)) });
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, limits);
    expect(res).toMatchObject({ status: 413, error: "repo_too_large" });
    if (!("markdown" in res)) expect(io.blobPaths).toEqual([]);
  });

  it("maps a 404 from the repo lookup to repo_not_found", async () => {
    const io = fakeIo({ entries: [] });
    (io as unknown as { fetchMeta: () => Promise<never> }).fetchMeta = async () => {
      throw new PublicGitHubError(404, "Not Found");
    };
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, limits);
    expect(res).toMatchObject({ status: 404, error: "repo_not_found" });
  });

  it("maps a 403 from GitHub to a 429 rate-limit failure", async () => {
    const io = fakeIo({ entries: [] });
    (io as unknown as { fetchMeta: () => Promise<never> }).fetchMeta = async () => {
      throw new PublicGitHubError(403, "API rate limit exceeded");
    };
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, limits);
    expect(res).toMatchObject({ status: 429, error: "github_rate_limited" });
  });

  it("404 on the requested ref maps to branch_not_found", async () => {
    const io = fakeIo({ entries: [] });
    (io as unknown as { fetchTree: () => Promise<never> }).fetchTree = async () => {
      throw new PublicGitHubError(404, "no commit");
    };
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: "nope" }, io, limits);
    expect(res).toMatchObject({ status: 404, error: "branch_not_found" });
  });

  it("generates markdown from parsed routes with run metadata, honoring the file cap", async () => {
    const entries = Array.from({ length: 10 }, (_, i) => entry(`app/api/r${i}/route.ts`));
    const io = fakeIo({
      entries,
      blobs: Object.fromEntries(entries.map((e) => [e.path, "export function GET() {}"])),
    });
    const capped = { ...limits, maxFiles: 4 };

    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, capped);

    if (!("markdown" in res)) throw new Error("expected success");
    expect(res.meta.endpointCount).toBe(4);
    expect(res.meta.filesScanned).toBe(4);
    expect(res.meta.filesSkipped).toBe(6);
    expect(res.meta.branch).toBe("main"); // defaulted from repo meta
    expect(io.blobPaths).toHaveLength(4);
    expect(res.markdown).toContain("# o/r — API Reference");
    expect(res.markdown).toContain("file cap: 4"); // honest coverage note
  });

  it("detects and names an unsupported framework when nothing parses", async () => {
    const io = fakeIo({
      entries: [entry("app/api/x/route.ts"), entry("server.ts")],
      blobs: {
        "app/api/x/route.ts": "export function GET() {}",
        "server.ts": 'app.get("/a", h); app.post("/b", h); app.put("/c", h);',
      },
      routes: [], // nothing parses — detection runs on the sampled entry files
    });
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, limits);
    if (!("markdown" in res)) throw new Error("expected success");
    expect(res.meta.framework).toBe("Express");
    expect(res.markdown).toContain("Express");
  });
});

// ---------------------------------------------------------------------------
// AI wiring — 20-route cap, budget guard, per-batch fallback, cache
// ---------------------------------------------------------------------------

describe("runPlaygroundGeneration AI wiring", () => {
  beforeEach(() => {
    __resetRateLimitStoreForTests();
    __resetDescriptionCacheForTests();
  });

  function aiRoutes(n: number): ParsedRoute[] {
    return Array.from({ length: n }, (_, i) => ({
      ...fakeRoute,
      method: "GET",
      routePath: `/api/r${i}`,
      filePath: `app/api/r${i}/route.ts`,
      jsdoc: `Handler ${i}.`,
    }) as unknown as ParsedRoute);
  }

  function aiIo(
    n: number,
    describeImpl: (routes: ParsedRoute[]) => Promise<Map<string, string>>,
  ) {
    const calls: ParsedRoute[][] = [];
    const io = fakeIo({
      entries: [entry("app/api/r0/route.ts")],
      blobs: { "app/api/r0/route.ts": "export function GET() {}" },
      routes: aiRoutes(n),
    });
    io.aiEnabled = () => true;
    io.describeRoutes = async (routes) => {
      calls.push(routes);
      return {
        descriptions: await describeImpl(routes),
        tokensIn: 100,
        tokensOut: 100,
        tokensUsed: 200,
        provider: null,
        privacyFallback: false,
        flagged: new Map(),
      };
    };
    return Object.assign(io, { calls });
  }
  const aiLimits = { ...playgroundLimits(), llmBatchRoutes: 10 };

  it("caps AI at the first llmRoutesMax routes; the rest keep JSDoc prose", async () => {
    const io = aiIo(8, async (rs) => new Map(rs.map((r) => [routeKey(r), `AI: ${routeKey(r)}`])));
    const capped = { ...aiLimits, llmRoutesMax: 5 };
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, capped);
    if (!("markdown" in res)) throw new Error("expected success");

    // Only the first 5 routes were sent to the LLM, in one batch of ≤10.
    expect(io.calls).toHaveLength(1);
    expect(io.calls[0]).toHaveLength(5);
    expect(res.markdown).toContain("AI: GET /api/r0");
    expect(res.markdown).toContain("AI: GET /api/r4");
    expect(res.markdown).not.toContain("AI: GET /api/r5");
    expect(res.markdown).toContain("AI descriptions for the first 5 of 8 routes");
    expect(res.markdown).toContain("Handler 5."); // route 5 keeps its JSDoc
  });

  it("falls back to JSDoc for a batch whose LLM call fails, and still returns 200-shaped output", async () => {
    const io = aiIo(3, async () => {
      throw new Error("groq down");
    });
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, {
      ...aiLimits,
      llmRoutesMax: 3,
      llmBatchRoutes: 2, // two batches; both fail
    });
    if (!("markdown" in res)) throw new Error("expected success");
    expect(res.markdown).toContain("Handler 0."); // JSDoc fallback prose survived
    expect(res.markdown).toContain("the LLM did not respond");
    expect(res.markdown).not.toContain("AI:");
  });

  it("stops calling the LLM once the global daily budget is exhausted and names it honestly", async () => {
    const io = aiIo(4, async (rs) => new Map(rs.map((r) => [routeKey(r), `AI: ${routeKey(r)}`])));
    // Budget: 1 LLM call allowed today. Batch 1 (2 routes) spends it; batch 2 skips.
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, {
      ...aiLimits,
      llmRoutesMax: 4,
      llmBatchRoutes: 2,
      llmDailyMax: 1,
    });
    if (!("markdown" in res)) throw new Error("expected success");
    expect(io.calls).toHaveLength(1); // batch 2 never went to the model
    expect(res.markdown).toContain("AI: GET /api/r0");
    expect(res.markdown).toContain("AI: GET /api/r1");
    expect(res.markdown).not.toContain("AI: GET /api/r2");
    expect(res.markdown).toContain("first 2 of 4 routes"); // honest scope note
  });

  it("serves an unchanged repo from cache on the second run — zero LLM calls", async () => {
    const io = aiIo(4, async (rs) => new Map(rs.map((r) => [routeKey(r), `AI: ${routeKey(r)}`])));
    const runOnce = () => runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, aiLimits);
    const first = await runOnce();
    const second = await runOnce();
    if (!("markdown" in first) || !("markdown" in second)) throw new Error("expected success");
    expect(io.calls).toHaveLength(1); // only the first run hit the model
    expect(second.markdown).toBe(first.markdown);
    expect(second.markdown).toContain("AI: GET /api/r0"); // still AI prose, from cache
  });
});
