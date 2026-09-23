import { describe, expect, it } from "vitest";
import {
  parseRouteFileWithDiagnostics,
  parseRouteFilesWithDiagnostics,
  detectUnsupportedFramework,
  routePathFromFilePath,
  type ParsedRoute,
} from "./route-parser";

const APP_FILE = "app/api/users/[id]/route.ts";

/** Parse and unwrap a single-route file (tests below parse one handler each). */
function parseRouteFileToRoute(filePath: string, src: string): ParsedRoute {
  const { routes } = parseRouteFileWithDiagnostics(filePath, src);
  expect(routes).toHaveLength(1);
  return routes[0];
}

describe("routePathFromFilePath", () => {
  it("strips app/ and route.ts and strips route groups", () => {
    expect(routePathFromFilePath("apps/web/app/(ee)/api/tokens/[id]/route.ts")).toBe("/api/tokens/[id]");
    expect(routePathFromFilePath("app/api/repos/route.tsx")).toBe("/api/repos");
  });
});

describe("direct handlers (existing behavior)", () => {
  it("parses export async function GET with inline context type", () => {
    const src = `export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) { return Response.json({}); }`;
    const { routes } = parseRouteFileWithDiagnostics(APP_FILE, src);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ method: "GET", routePath: "/api/users/[id]" });
    expect(routes[0].params).toEqual([
      { name: "params", type: "Promise<{ id: string }>", kind: "url", typeResolved: true },
    ]);
  });

  it("single-argument direct handlers report no params (request arg is not route context)", () => {
    const src = `export async function POST(request: Request) { return Response.json({}); }`;
    const { routes } = parseRouteFileWithDiagnostics("app/api/ping/route.ts", src);
    expect(routes[0].params).toEqual([]);
  });
});

describe("wrapped handlers", () => {
  it("extracts a wrapped handler's inline destructured context (dub/cal.com style)", () => {
    const src = `import { withWorkspace } from "@/lib/auth";
export const GET = withWorkspace(
  async ({ workspace, params }) => {
    return Response.json({ id: params.id, workspace: workspace.id });
  }
);`;
    const { routes } = parseRouteFileWithDiagnostics("app/api/tokens/[id]/route.ts", src);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ method: "GET", wrapped: true, wrappedVia: "withWorkspace" });
    expect(routes[0].params).toEqual([
      { name: "workspace", type: "", kind: "context", typeResolved: false },
      { name: "params", type: "", kind: "url", typeResolved: false },
    ]);
  });

  it("resolves a same-file handler referenced by a wrapper (cal.com style)", () => {
    const src = `import { defaultResponderForAppDir } from "app/api/defaultResponderForAppDir";
async function handler(req: Request) {
  return Response.json({ ok: true });
}
export const DELETE = defaultResponderForAppDir(handler);
export const POST = defaultResponderForAppDir(handler);`;
    const { routes } = parseRouteFileWithDiagnostics("app/api/cancel/route.ts", src);
    expect(routes.map((r) => r.method).sort()).toEqual(["DELETE", "POST"]);
    expect(routes.every((r) => r.wrapped && r.wrappedVia === "defaultResponderForAppDir")).toBe(true);
    // Single-arg handler: no params invented.
    expect(routes.every((r) => r.params.length === 0)).toBe(true);
  });

  // Wrapped handlers whose callback is multi-arg keep request-usage detection working.
  it("detects request usage through the wrapper's inline callback", () => {
    const src = `export const POST = withAuth(async (req, ctx) => {
  const body = await req.json();
  return Response.json({ body });
});`;
    const { routes } = parseRouteFileWithDiagnostics("app/api/echo/route.ts", src);
    expect(routes).toHaveLength(1);
    expect(routes[0].hasRequestUsage).toBe(true);
  });

  it("wrapping a wrapped handler still finds the innermost callback", () => {
    const src = `export const GET = withRouteErrors("GET /x", withAuth(async ({ params }) => {
  return Response.json({ ok: params.id });
}));`;
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", src);
    expect(routes).toHaveLength(1);
    expect(routes[0].wrapped).toBe(true);
    expect(routes[0].params).toEqual([{ name: "params", type: "", kind: "url", typeResolved: false }]);
  });
});

describe("opaque wrapped exports", () => {
  it("reports unresolvable wrapped exports in diagnostics instead of dropping them", () => {
    const src = `import { handler } from "./handler";
export const POST = withRouteErrors("POST /api/x", handler);`;
    const { routes, diagnostics } = parseRouteFileWithDiagnostics("app/api/x/route.ts", src);
    expect(routes).toHaveLength(0);
    expect(diagnostics.wrappedOpaque).toEqual([{ method: "POST", filePath: "app/api/x/route.ts" }]);
  });

  it("aggregates diagnostics across files", () => {
    const res = parseRouteFilesWithDiagnostics([
      { path: "app/api/a/route.ts", content: `import { h } from "./h";\nexport const GET = wrap(h);` },
      { path: "app/api/b/route.ts", content: `export function GET() { return new Response("b"); }` },
    ]);
    expect(res.routes).toHaveLength(1);
    expect(res.diagnostics.wrappedOpaque).toEqual([{ method: "GET", filePath: "app/api/a/route.ts" }]);
  });

  it("a non-call initializer is also opaque, not guessed", () => {
    const src = `import { handler } from "./handler";
export const GET = handler;`;
    const { routes, diagnostics } = parseRouteFileWithDiagnostics("app/api/y/route.ts", src);
    expect(routes).toHaveLength(0);
    expect(diagnostics.wrappedOpaque).toEqual([{ method: "GET", filePath: "app/api/y/route.ts" }]);
  });
});

describe("zod request-body extraction (M1)", () => {
  it("extracts an inline z.object schema with chained constraints", () => {
    const src = `import { z } from "zod";
export async function POST(req: Request) {
  const body = z.object({
    email: z.string().email().max(50),
    age: z.number().int().min(0).optional(),
  }).parse(await req.json());
  return Response.json({ ok: true });
}`;
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", src);
    expect(routes[0].requestBody).toEqual({
      source: "zod",
      schemaName: null,
      resolved: true,
      fields: [
        { name: "email", type: "string", optional: false, constraints: ["email", "max(50)"], enumValues: undefined, defaultValue: undefined, typeResolved: true },
        { name: "age", type: "number", optional: true, constraints: ["int", "min(0)"], enumValues: undefined, defaultValue: undefined, typeResolved: true },
      ],
    });
  });

  it("resolves a named same-file schema referenced via .parse()", () => {
    const src = `import { z } from "zod";
const bodySchema = z.object({
  name: z.string().min(1),
  role: z.enum(["admin", "viewer"]).default("viewer"),
});
export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  return Response.json(body);
}`;
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", src);
    expect(routes[0].requestBody?.schemaName).toBe("bodySchema");
    expect(routes[0].requestBody?.resolved).toBe(true);
    expect(routes[0].requestBody?.fields).toEqual([
      { name: "name", type: "string", optional: false, constraints: ["min(1)"], enumValues: undefined, defaultValue: undefined, typeResolved: true },
      { name: "role", type: "enum: admin | viewer", optional: false, constraints: [], enumValues: ["admin", "viewer"], defaultValue: '"viewer"', typeResolved: true },
    ]);
  });

  it("resolves z.infer-style value references through one-hop same-file lookup", () => {
    const src = `import { z } from "zod";
const inputSchema = z.object({ id: z.string().uuid(), tags: z.array(z.string()).max(5) });
const bodySchema = inputSchema;
export async function POST(req: Request) {
  const body = bodySchema.parse(await req.json());
  return Response.json(body);
}`;
    const route = parseRouteFileToRoute("app/api/x/route.ts", src);
    expect(route.requestBody?.resolved).toBe(true);
    expect(route.requestBody?.fields.map((f) => f.name)).toEqual(["id", "tags"]);
  });

  it("names an imported schema honestly without inventing fields", () => {
    const src = `import { tokenSchema } from "@/lib/zod/schemas/token";
import { z } from "zod";
export async function POST(req: Request) {
  const body = tokenSchema.parse(await req.json());
  return Response.json(body);
}`;
    const route = parseRouteFileToRoute("app/api/x/route.ts", src);
    expect(route.requestBody).toEqual({
      source: "zod",
      schemaName: "tokenSchema",
      fields: [],
      resolved: false,
    });
  });

  it("treats a dynamically-built schema as unresolved, never guessed", () => {
    const src = `import { z } from "zod";
const base = { q: z.string() };
export async function POST(req: Request) {
  const dyn = z.object(base).extend({ extra: z.string() });
  const body = dyn.parse(await req.json());
  return Response.json(body);
}`;
    const route = parseRouteFileToRoute("app/api/x/route.ts", src);
    // The schema exists and is named (dyn) but is derived (extend) — named honestly, fields not claimed.
    expect(route.requestBody).toEqual({ source: "zod", schemaName: "dyn", fields: [], resolved: false });
  });

  it("claims nothing when no parse call consumes the request json", () => {
    const src = `export async function GET() { return Response.json({}); }`;
    const route = parseRouteFileToRoute("app/api/y/route.ts", src);
    expect(route.requestBody).toBeUndefined();
  });

  it("resolves a one-hop const x = await req.json() variable", () => {
    const src = `import { z } from "zod";
const schema = z.object({ q: z.string() });
export async function POST(req: Request) {
  const json = await req.json();
  const body = schema.parse(json);
  return Response.json(body);
}`;
    const route = parseRouteFileToRoute("app/api/x/route.ts", src);
    expect(route.requestBody?.resolved).toBe(true);
    expect(route.requestBody?.fields.map((f) => f.name)).toEqual(["q"]);
  });

  it("wrapped handlers get body extraction through the resolved callback", () => {
    const src = `import { z } from "zod";
export const POST = withAuth(async (req) => {
  const body = z.object({ title: z.string() }).parse(await req.json());
  return Response.json(body);
});`;
    const route = parseRouteFileToRoute("app/api/x/route.ts", src);
    expect(route.requestBody?.resolved).toBe(true);
    expect(route.requestBody?.fields.map((f) => f.name)).toEqual(["title"]);
  });

  it("ambiguous multi-parse handlers stay unresolved", () => {
    const src = `import { z } from "zod";
const a = z.object({ x: z.string() });
const b = z.object({ y: z.string() });
export async function POST(req: Request) {
  const body = a.parse(await req.json());
  const extra = b.parse(await req.json());
  return Response.json({ body, extra });
}`;
    const route = parseRouteFileToRoute("app/api/x/route.ts", src);
    expect(route.requestBody).toEqual({ source: "zod", schemaName: null, fields: [], resolved: false });
  });
});

describe("detectUnsupportedFramework", () => {
  it("returns null for Next.js route files", () => {
    const files = [{ path: "app/api/a/route.ts", content: `export function GET() { return new Response("a"); }` }];
    expect(detectUnsupportedFramework(files)).toBeNull();
  });

  it("detects Express route registrations", () => {
    const files = [
      { path: "server/routes/users.js", content: `router.get("/users", (req, res) => res.json({}));` },
      { path: "server.js", content: `app.post("/users", (req, res) => {});\napp.delete("/users/:id", (req, res) => {});` },
    ];
    expect(detectUnsupportedFramework(files)).toBe("Express");
  });

  it("detects NestJS controllers/decorators", () => {
    const files = [
      { path: "src/cats.controller.ts", content: `@Controller("cats")\nexport class CatsController { @Get() findAll() {} }` },
      { path: "src/dogs.controller.ts", content: `@Controller("dogs")\nexport class DogsController {}` },
    ];
    expect(detectUnsupportedFramework(files)).toBe("NestJS");
  });
});

describe("cross-file schema resolution (M2)", () => {
  const schemaFile = {
    path: "src/lib/schemas.ts",
    content: `import { z } from "zod";
export const tokenSchema = z.object({
  token: z.string().min(10),
  scopes: z.array(z.enum(["read", "write"])).default(["read"]),
});`,
  };
  const routeUsingImport = `import { tokenSchema } from "@/lib/schemas";
export async function POST(req: Request) {
  const body = tokenSchema.parse(await req.json());
  return Response.json(body);
}`;

  it("resolves a schema imported via the @/ alias", () => {
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", routeUsingImport, [schemaFile]);
    expect(routes[0].requestBody?.resolved).toBe(true);
    expect(routes[0].requestBody?.schemaName).toBe("tokenSchema");
    expect(routes[0].requestBody?.fields.map((f) => f.name)).toEqual(["token", "scopes"]);
  });

  const routeImporting = (specifier: string, name = "tokenSchema") => `import { ${name} } from "${specifier}";
export async function POST(req: Request) {
  const body = ${name}.parse(await req.json());
  return Response.json(body);
}`;

  it("resolves a schema imported via a relative path", () => {
    const sibling = { path: "app/api/x/schemas.ts", content: schemaFile.content };
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", routeImporting("./schemas"), [sibling]);
    expect(routes[0].requestBody?.resolved).toBe(true);
    expect(routes[0].requestBody?.fields.map((f) => f.name)).toEqual(["token", "scopes"]);
  });

  it("resolves a schema imported with a .js extension (TS convention)", () => {
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", routeImporting("@/lib/schemas.js"), [schemaFile]);
    expect(routes[0].requestBody?.resolved).toBe(true);
  });

  it("a derivation on an imported schema (extend) stays honestly unresolved", () => {
    const derivedFile = {
      path: "src/lib/derived.ts",
      content: `import { z } from "zod";
import { tokenSchema } from "./schemas";
export const extended = tokenSchema.extend({ extra: z.string() });`,
    };
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", routeImporting("@/lib/derived", "extended"), [
      schemaFile,
      derivedFile,
    ]);
    // extend is a derivation: the schema is reachable and named, fields not claimed.
    expect(routes[0].requestBody).toEqual({ source: "zod", schemaName: "extended", fields: [], resolved: false });
  });

  it("resolves an alias-to-import chain (const local = imported)", () => {
    const aliasFile = {
      path: "src/lib/alias.ts",
      content: `import { tokenSchema } from "@/lib/schemas";
export const aliased = tokenSchema;`,
    };
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", routeImporting("@/lib/alias", "aliased"), [
      schemaFile,
      aliasFile,
    ]);
    expect(routes[0].requestBody?.resolved).toBe(true);
    expect(routes[0].requestBody?.fields.map((f) => f.name)).toEqual(["token", "scopes"]);
  });

  it("resolves through the src/ layout when the route is not under src/", () => {
    const srcLayoutFile = { path: "src/lib/schemas.ts", content: schemaFile.content };
    const { routes } = parseRouteFileWithDiagnostics(
      "src/app/api/x/route.ts",
      `import { tokenSchema } from "@/lib/schemas";
export async function POST(req: Request) {
  const body = tokenSchema.parse(await req.json());
  return Response.json(body);
}`,
      [srcLayoutFile],
    );
    expect(routes[0].requestBody?.resolved).toBe(true);
  });

  it("keeps the honest named gap when the imported file is not in the index", () => {
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", routeImporting("@/lib/schemas"), []);
    expect(routes[0].requestBody).toEqual({ source: "zod", schemaName: "tokenSchema", fields: [], resolved: false });
  });

  it("keeps the honest named gap for a package import (zod folder)", () => {
    const pkg = `import { tokenSchema } from "@acme/schemas";
export async function POST(req: Request) {
  const body = tokenSchema.parse(await req.json());
  return Response.json(body);
}`;
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", pkg, [
      { path: "node_modules/@acme/schemas.ts", content: schemaFile.content },
    ]);
    expect(routes[0].requestBody).toEqual({ source: "zod", schemaName: "tokenSchema", fields: [], resolved: false });
  });

  it("does not hang or fabricate on an import cycle", () => {
    const a = { path: "src/lib/a.ts", content: `import { b } from "./b";\nexport const a = b;` };
    const b = { path: "src/lib/b.ts", content: `import { a } from "./a";\nexport const b = a;` };
    const { routes } = parseRouteFileWithDiagnostics(
      "app/api/x/route.ts",
      `import { a } from "@/lib/a";
export async function POST(req: Request) {
  const body = a.parse(await req.json());
  return Response.json(body);
}`,
      [a, b],
    );
    // Neither file defines a zod chain — named gap, no fields, no crash.
    expect(routes[0].requestBody).toEqual({ source: "zod", schemaName: "a", fields: [], resolved: false });
  });

  it("a non-zod imported binding never gains a type", () => {
    const helper = { path: "src/lib/notzod.ts", content: `export const thing = { parse: () => ({}) };` };
    const { routes } = parseRouteFileWithDiagnostics(
      "app/api/x/route.ts",
      `import { thing } from "@/lib/notzod";
export async function POST(req: Request) {
  const body = thing.parse(await req.json());
  return Response.json(body);
}`,
      [helper],
    );
    // Not provably zod: named as written, nothing claimed about fields.
    expect(routes[0].requestBody).toEqual({ source: "zod", schemaName: "thing", fields: [], resolved: false });
  });

  it("batch parsing resolves imports across the batch without repoFiles", () => {
    const route = {
      path: "app/api/x/route.ts",
      content: routeImporting("@/lib/schemas"),
    };
    const { routes } = parseRouteFilesWithDiagnostics([route, schemaFile]);
    expect(routes[0].requestBody?.resolved).toBe(true);
    expect(routes[0].requestBody?.fields.map((f) => f.name)).toEqual(["token", "scopes"]);
  });

  it("enum fields from an imported schema keep their literal values", () => {
    const { routes } = parseRouteFileWithDiagnostics("app/api/x/route.ts", routeImporting("@/lib/schemas"), [schemaFile]);
    const scopes = routes[0].requestBody?.fields.find((f) => f.name === "scopes");
    expect(scopes?.type).toBe("enum: read | write[]");
    expect(scopes?.defaultValue).toBe('["read"]');
  });
});
