import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlaygroundCapacityForTests,
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
import type { ParsedRoute } from "./route-parser";

afterEach(() => {
  vi.unstubAllEnvs();
  __resetPlaygroundCapacityForTests();
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
      return { entries: opts.entries, truncated: false };
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
  };
  return Object.assign(io, { blobPaths });
}

describe("runPlaygroundGeneration", () => {
  const limits = playgroundLimits();

  it("refuses private repos with the Starter pitch", async () => {
    const io = fakeIo({ meta: { isPrivate: true }, entries: [] });
    const res = await runPlaygroundGeneration({ owner: "o", repo: "r", ref: null }, io, limits);
    expect(res).toMatchObject({ status: 403, error: "repo_not_public" });
    expect(res).toHaveProperty("message");
    if ("message" in res) expect(res.message).toContain("Starter");
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
