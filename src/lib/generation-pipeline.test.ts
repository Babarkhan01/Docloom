import { describe, expect, it } from "vitest";
import { executePipeline, type GenerationStore, type PipelineIo } from "./generation";
import type { ParsedRoute } from "./route-parser";
import type { RepoTreeEntry } from "./github";

/**
 * Pipeline tests use fake I/O and an in-memory store. The structural
 * guarantee under test: the store API exposes no way to write publishedAt or
 * publishedGenerationId, so a run — manual or webhook-queued — cannot publish
 * or disturb the published docs, in success AND failure paths.
 */

type GenPatch = Parameters<GenerationStore["updateGeneration"]>[1];

function fakeRepo() {
  const now = new Date("2026-09-20T00:00:00Z");
  return {
    id: "repo-1",
    userId: "user-1",
    githubRepoFullName: "o/r",
    owner: "o",
    name: "r",
    installationId: 42,
    defaultBranch: "main",
    isPrivate: false,
    docsSubdomain: "o-r",
    status: "active" as const,
    autoRegenerate: true,
    lastProcessedCommitSha: null,
    lastWebhookAt: null,
    error: null,
    connectedAt: now,
    lastGeneratedAt: null,
    publishedGenerationId: "published-gen-keep",
    updatedAt: now,
  };
}

function memoryStore() {
  const genPatches: Record<string, GenPatch[]> = {};
  const repoPatches: { repoId: string; patch: Parameters<GenerationStore["updateRepo"]>[1] }[] = [];
  const quota: { userId: string; tokens: number }[] = [];
  const store: GenerationStore = {
    async updateGeneration(id, patch) {
      (genPatches[id] ??= []).push(patch);
    },
    async updateRepo(repoId, patch) {
      repoPatches.push({ repoId, patch });
    },
    async addQuota(userId, tokens) {
      quota.push({ userId, tokens });
    },
  };
  return { store, genPatches, repoPatches, quota };
}

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

function fakeIo(entries: RepoTreeEntry[], blobs: Record<string, string | null>, routes: ParsedRoute[] = [fakeRoute]): PipelineIo & { blobFetches: string[] } {
  const blobFetches: string[] = [];
  return {
    blobFetches,
    async fetchTree() {
      return { entries, truncated: false };
    },
    async fetchBlob(_i, _o, _n, path) {
      blobFetches.push(path);
      return blobs[path] ?? null;
    },
    parseRouteFiles: () => routes,
    aiEnabled: () => false,
    async describeRoutes() {
      throw new Error("describeRoutes must not be called when AI is disabled");
    },
  };
}

function entry(path: string): RepoTreeEntry {
  return { path, type: "blob", size: 100 };
}

describe("executePipeline", () => {
  it("writes a successful draft, touches the repo, and bumps quota — without touching published state", async () => {
    const repo = fakeRepo();
    const { store, genPatches, repoPatches, quota } = memoryStore();
    const io = fakeIo([entry("app/api/a/route.ts")], { "app/api/a/route.ts": "export function GET() {}" });

    const outcome = await executePipeline(repo, "gen-1", { maxFiles: 50 }, io, store);

    expect(outcome).toMatchObject({ ok: true, generationId: "gen-1", endpointCount: 1 });
    const patches = genPatches["gen-1"];
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ status: "success" });
    expect(patches[0]?.markdown).toContain("# o/r — API Reference");
    expect(patches[0]?.markdown).toContain("GET /api/widgets");
    expect(repoPatches).toEqual([{ repoId: "repo-1", patch: { lastGeneratedAt: expect.any(Date), updatedAt: expect.any(Date) } }]);
    expect(quota).toEqual([{ userId: "user-1", tokens: 0 }]);
  });

  it("on failure records status=failed with the reason and nothing else — published docs untouched", async () => {
    const repo = fakeRepo();
    const { store, genPatches, repoPatches, quota } = memoryStore();
    const io = fakeIo([], {});
    io.fetchTree = async () => {
      throw new Error("GitHub API error 403");
    };

    const outcome = await executePipeline(repo, "gen-2", { maxFiles: 50 }, io, store);

    expect(outcome).toMatchObject({ ok: false, error: "generation_failed" });
    const patches = genPatches["gen-2"];
    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({ status: "failed", errorMessage: "GitHub API error 403" });
    expect(patches[0]?.markdown).toBeUndefined();
    // No repo touch, no quota spend on failure.
    expect(repoPatches).toEqual([]);
    expect(quota).toEqual([]);
    // Structural: no recorded patch can reach published state.
    for (const p of patches) {
      expect(Object.keys(p)).not.toContain("publishedAt");
      expect(Object.keys(p)).not.toContain("publishedGenerationId");
    }
  });

  it("caps fetched files and says so in the draft (coverage note)", async () => {
    const repo = fakeRepo();
    const { store, genPatches } = memoryStore();
    const entries = Array.from({ length: 25 }, (_, i) => entry(`app/api/r${i}/route.ts`));
    const blobs = Object.fromEntries(entries.map((e) => [e.path, "export function GET() {}"]));
    const io = fakeIo(entries, blobs);

    const outcome = await executePipeline(repo, "gen-3", { maxFiles: 20 }, io, store);

    expect(outcome).toMatchObject({ ok: true });
    expect(io.blobFetches).toHaveLength(20);
    const markdown = genPatches["gen-3"][0]?.markdown ?? "";
    expect(markdown).toContain("Coverage note");
    expect(markdown).toContain("5 route files were not scanned in this run (file cap: 20)");
  });

  it("omits the coverage note when everything fit under the cap", async () => {
    const repo = fakeRepo();
    const { store, genPatches } = memoryStore();
    const io = fakeIo([entry("app/api/a/route.ts")], { "app/api/a/route.ts": "x" });

    await executePipeline(repo, "gen-4", { maxFiles: 20 }, io, store);

    expect(genPatches["gen-4"][0]?.markdown).not.toContain("Coverage note");
  });

  it("skips unreadable blobs instead of failing the run", async () => {
    const repo = fakeRepo();
    const { store, genPatches } = memoryStore();
    const io = fakeIo(
      [entry("app/api/a/route.ts"), entry("app/api/b/route.ts")],
      { "app/api/a/route.ts": "export function GET() {}", "app/api/b/route.ts": null },
    );

    const outcome = await executePipeline(repo, "gen-5", { maxFiles: 50 }, io, store);

    expect(outcome).toMatchObject({ ok: true, endpointCount: 1 });
    expect(genPatches["gen-5"][0]?.status).toBe("success");
  });
});
