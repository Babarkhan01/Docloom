/**
 * Eval: run the same fixture route handlers through each CONFIGURED provider
 * and report invented-parameter count, "not documented in source" rate,
 * latency, and errors. guidance: fixture handlers are embedded here (no
 * network beyond the providers themselves).
 *
 * Usage: npx tsx scripts/eval-providers.ts
 * Needs the provider env vars (LLM_PROVIDER is irrelevant — each provider
 * runs explicitly). Never prints key material.
 */
import { parseRouteFiles, type ParsedRoute } from "../src/lib/route-parser";
import { describeRoutes, flagInventedNames } from "../src/lib/ai";
import { ALL_PROVIDERS, providerReady, type ProviderId } from "../src/lib/llm";

// ---------------------------------------------------------------------------
// Fixture: 15 route handlers across 9 files covering the shapes the pipeline
// sees daily — zod bodies, query/header inputs, dynamic segments, wrapped
// handlers, unresolvable schemas, honest gaps.
// ---------------------------------------------------------------------------

const FILE_WITH_6_HANDLERS = /* ts */ `
import { z } from "zod";
import { withAuth } from "./lib/auth";

const CreateUserInput = z.object({
  email: z.string().email(),
  name: z.string().max(50),
  role: z.enum(["admin", "member"]).default("member"),
});

/** List all users with pagination. */
export async function GET(request: Request) {
  const page = request.nextUrl.searchParams.get("page") ?? "1";
  const limit = request.nextUrl.searchParams.get("limit") ?? "20";
  const users = [{ id: "u1", email: "a@b.c", name: "A", role: "member" }];
  return Response.json({ items: users, page: Number(page), limit: Number(limit) });
}

/** Create a user from a validated body. */
export async function POST(request: Request) {
  const body = CreateUserInput.parse(await request.json());
  return Response.json({ id: "u2", ...body }, { status: 201 });
}
`;

const FILE_WITH_5_PARTIALS = /* ts */ `
import { z } from "zod";
import { withWorkspace } from "../lib/workspace";
import { getStats } from "../lib/stats";

// Wrapped with an imported wrapper: params are reported, fields "not documented in source".
export const GET = withWorkspace(async ({ params }) => {
  const stats = await getStats(params.workspace);
  return Response.json({ ok: true });
});

const Body = z.object({ fields: z.array(z.string()) });
`;

const USER_DETAIL_FILE = /* ts */ `
import { z } from "zod";

const UpdateUserInput = z.object({
  name: z.string().max(50),
  role: z.enum(["admin", "member"]),
});

/** Fetch one user by id. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (id !== "u1") {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ id, email: "a@b.c", name: "A", role: "member" });
}

/** Update a user from a validated body. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = UpdateUserInput.parse(await request.json());
  return Response.json({ id, ...body });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  return new Response(null, { status: 204 });
}
`;

const PROJECTS_FILE = /* ts */ `
import { z } from "zod";

const CreateProjectInput = z.object({
  name: z.string().min(1),
  visibility: z.enum(["public", "private"]).default("private"),
});

/** List projects, newest first; x-org-id selects the org. */
export async function GET(request: Request) {
  const cursor = request.nextUrl.searchParams.get("cursor") ?? null;
  const orgId = request.headers.get("x-org-id") ?? "";
  return Response.json({ items: [], nextCursor: cursor, orgId });
}

/** Create a project from a validated body. */
export async function POST(request: Request) {
  const body = CreateProjectInput.parse(await request.json());
  if (body.visibility === "private") {
    return Response.json({ error: "plan_limited" }, { status: 402 });
  }
  return Response.json({ id: "p1", ...body }, { status: 201 });
}
`;

const MEMBERS_FILE = /* ts */ `
import { z } from "zod";
import { withOrg } from "../lib/org";

const AddMemberInput = z.object({
  email: z.string().email(),
  seat: z.enum(["member", "admin"]).default("member"),
});

// Imported wrapper: fields are reported "not documented in source".
export const GET = withOrg(async ({ params }) => {
  return Response.json({ members: [] });
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = AddMemberInput.parse(await request.json());
  return Response.json({ projectId: id, ...body }, { status: 201 });
}
`;

const HOOKS_FILE = /* ts */ `
/** Register a webhook endpoint. */
export async function POST(request: Request): Promise<Response> {
  const body = (await request.json()) as { url: string };
  return Response.json({ id: "h1", url: body.url, status: "active" }, { status: 201 });
}

/** List registered webhooks. */
export async function GET() {
  return Response.json({ hooks: [] });
}
`;

const SEARCH_FILE = /* ts */ `
/** Full-text search across project docs. */
export async function GET(request: Request) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const page = request.nextUrl.searchParams.get("page") ?? "1";
  if (!q) {
    return Response.json({ error: "missing_query", q }, { status: 400 });
  }
  return Response.json({ results: [], q, page: Number(page) });
}
`;

const SIMPLE_FILE = /* ts */ `
/** Health probe. */
export async function GET() {
  return Response.json({ status: "ok" });
}

export async function DELETE() {
  return new Response(null, { status: 204 });
}
`;

const EMPTY_FILE = /* ts */ `export const config = {};`;

const FIXTURE_FILES = [
  { path: "app/api/users/route.ts", content: FILE_WITH_6_HANDLERS.replace("import { withAuth }", "// withAuth unused") },
  { path: "app/api/users/[id]/route.ts", content: USER_DETAIL_FILE },
  { path: "app/api/projects/route.ts", content: PROJECTS_FILE },
  { path: "app/api/projects/[id]/members/route.ts", content: MEMBERS_FILE },
  { path: "app/api/hooks/route.ts", content: HOOKS_FILE },
  { path: "app/api/search/route.ts", content: SEARCH_FILE },
  { path: "app/api/workspaces/[ws]/stats/route.ts", content: FILE_WITH_5_PARTIALS },
  { path: "app/api/health/route.ts", content: SIMPLE_FILE },
  { path: "app/api/legacy/route.ts", content: EMPTY_FILE },
];

export function fixtureRoutes(): ParsedRoute[] {
  return parseRouteFiles(FIXTURE_FILES);
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

type ProviderStats = {
  provider: string;
  configured: boolean;
  routes: number;
  described: number;
  inventedCount: number;
  inventedTotal: number;
  ndisRate: number; // fraction of descriptions containing "not documented in source"
  errors: number;
  latencyMs: number; // total across the batch
};

async function evalProvider(id: ProviderId, routes: ParsedRoute[]): Promise<ProviderStats> {
  const ready = providerReady(id);
  if (!ready) {
    return { provider: id, configured: false, routes: routes.length, described: 0, inventedCount: 0, inventedTotal: 0, ndisRate: 0, errors: 0, latencyMs: 0 };
  }
  const started = Date.now();
  let described = 0;
  let inventedCount = 0;
  let inventedTotal = 0;
  let ndisCount = 0;
  let errors = 0;

  try {
    const res = await describeRoutes(routes, /* repoPublic */ true);
    described = res.descriptions.size;
    const invented = flagInventedNames(routes, res.descriptions);
    for (const tokens of invented.values()) {
      if (tokens.length > 0) inventedCount++;
      inventedTotal += tokens.length;
    }
    for (const d of res.descriptions.values()) {
      if (/not documented in source/i.test(d)) ndisCount++;
    }
  } catch {
    errors = 1; // provider-level failure (network/auth/5xx after budget)
  }

  return {
    provider: id,
    configured: true,
    routes: routes.length,
    described,
    inventedCount,
    inventedTotal,
    ndisRate: described > 0 ? ndisCount / described : 0,
    errors,
    latencyMs: Date.now() - started,
  };
}

async function main(): Promise<void> {
  const routes = fixtureRoutes();
  console.log(`fixture: ${FIXTURE_FILES.length} files → ${routes.length} routes\n`);
  const rows: ProviderStats[] = [];
  for (const id of ALL_PROVIDERS) rows.push(await evalProvider(id, routes));

  // Output a small, fixed-width table.
  const fmt = (s: ProviderStats) =>
    [
      s.provider.padEnd(10),
      String(s.routes).padStart(6),
      String(s.described).padStart(9),
      String(s.inventedCount).padStart(12),
      String(s.inventedTotal).padStart(10),
      `${(s.ndisRate * 100).toFixed(0)}%`.padStart(5),
      String(s.errors).padStart(6),
      `${s.latencyMs}ms`.padStart(9),
    ].join(" ");

  console.log("provider    routes  described  invented/rt  invented/tok  ndis%  errors  latency");
  console.log("--------    ------  ---------  -----------  ------------  -----  ------  -------");
  for (const s of rows) console.log(fmt(s));
  const anyErr = rows.some((s) => s.errors > 0);
  process.exitCode = anyErr ? 1 : 0;
}

const isMain = process.argv[1]?.endsWith("eval-providers.ts") ?? false;
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  });
}
