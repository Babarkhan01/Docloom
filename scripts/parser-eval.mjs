#!/usr/bin/env node
/**
 * parser-eval.mjs — offline eval harness for Docloom's route parser.
 *
 * HARD CONSTRAINTS honored:
 *  - No DB: imports ONLY src/lib/route-parser.ts (which imports only `typescript`).
 *    src/lib/db.ts is a lazy proxy — never imported here, so nothing can connect.
 *  - No network, no AI: parseRouteFiles is pure; no API keys are read.
 *  - No secrets: reads only repo source files given on the CLI. No .env* access.
 *  - Never invents output: what the parser can't determine is printed as such.
 *
 * Usage:
 *   node scripts/parser-eval.mjs <repo-root> [more roots...] [--all]
 *
 * For each root it:
 *  - walks the tree (respecting standard ignore dirs), collecting route.ts/tsx
 *    candidates plus, with --all, other server-looking files,
 *  - runs the PRODUCTION parser (parseRouteFiles) on Next.js candidates and
 *    reports routes found (method + path), routes with missing params/types,
 *    and files skipped (too large / unreadable / over cap),
 *  - with --all, greps other server files for Express/Fastify/NestJS route
 *    registrations — quantifying what the parser structurally cannot see.
 *
 * Prints counts and paths only; never prints file contents.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Import the production parser (self-contained; type-stripped TS import).
const { parseRouteFiles, parseRouteFilesCrossFile, schemaImportCandidates } = await import(
  new URL("../src/lib/route-parser.ts", import.meta.url).href
);

// ---------------------------------------------------------------------------
// Constants mirroring the production pipeline (src/lib/generation.ts)
// ---------------------------------------------------------------------------

const MAX_FILES = 50; // executePipeline maxFiles for manual runs
const MAX_FILE_BYTES = 64 * 1024; // executePipeline MAX_FILE_BYTES

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo",
  ".vercel", ".wrangler", ".yarn", ".cache", "vendor", "tmp", "temp",
  // Docloom's own non-source dirs, when pointing the harness at this repo:
  "drizzle", "scripts",
  // Frontend-only trees: no server registrations, huge in real repos.
  "components", "ui", "hooks", "stores", "styles", "assets", "public", "emails",
]);

const SERVER_FILE_RE = /route\.(ts|tsx)$/;
const SERVER_JS_FILE_RE = /route\.(js|jsx)$/;
const OTHER_SERVER_RE = /(\.controller\.ts|\.service\.ts|server\.ts|server\.js|app\.ts|app\.js|index\.ts|index\.js|main\.ts|main\.js)$/;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const rawArgs = process.argv.slice(2);
const allFlag = rawArgs.includes("--all");
const roots = rawArgs.filter((a) => a !== "--all");
if (roots.length === 0) {
  console.error("Usage: node scripts/parser-eval.mjs <repo-root> [more roots...] [--all]");
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

function relPath(root, dir, name) {
  return path.relative(root, path.join(dir, name)).split(path.sep).join("/");
}

/** Iterative walk collecting {rel, full} for every file under root. */
function collect(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".auth" && e.name !== ".well-known") continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        out.push({ rel: relPath(root, dir, e.name), full });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Framework sniffing (text-level, no AST) — quantifies the unsupported-
// framework gap honestly. This does NOT parse; it only counts registrations
// a human would expect to see documented.
// ---------------------------------------------------------------------------

const FRAMEWORK_PATTERNS = [
  { framework: "Express", re: /\b(?:app|router|api)\s*\.\s*(?:get|post|put|patch|delete|all|use)\s*\(\s*["'`]/ },
  { framework: "Fastify", re: /\b(?:fastify|app|server)\s*\.\s*(?:get|post|put|patch|delete|route)\s*\(\s*["'`]/ },
  { framework: "NestJS", re: /@(?:Controller|Get|Post|Put|Patch|Delete)\s*\(/ },
];

function sniffFrameworkRegistrations(files) {
  const hits = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f.full, "utf8");
    } catch {
      continue;
    }
    for (const { framework, re } of FRAMEWORK_PATTERNS) {
      if (re.test(text)) {
        hits.push({ framework, rel: f.rel });
        break; // one hit per file is enough for counting
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function fmtRoute(r) {
  const dyn = r.dynamicSegments.map((s) => `:${s}`).join(",");
  const flag = r.params.length ? "" : (r.dynamicSegments.length ? "  [NO PARAMS]" : "");
  return `${(r.method ?? "?").padEnd(6)} ${r.routePath}${dyn ? `  dyn(${dyn})` : ""}${flag}`;
}

function reportForRoot(root) {
  const files = collect(root);
  const nextTs = files.filter((f) => SERVER_FILE_RE.test(f.rel));
  const nextJs = files.filter((f) => SERVER_JS_FILE_RE.test(f.rel));
  const other = files.filter((f) => OTHER_SERVER_RE.test(f.rel) && !SERVER_FILE_RE.test(f.rel));

  // Mirrors executePipeline: size-excluded files are dropped BEFORE the cap
  // and (today) are never reported — counted here as a failure-mode input.
  const contents = [];
  const tooLarge = [];
  const unreadable = [];
  for (const f of nextTs) {
    let content = null;
    try {
      content = readFileSync(f.full, "utf8");
    } catch {
      unreadable.push(f.rel);
      continue;
    }
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
      tooLarge.push(f.rel);
      continue;
    }
    contents.push({ path: f.rel, content });
  }
  const underCap = contents.slice(0, MAX_FILES);
  const overCap = contents.slice(MAX_FILES);

  // Cross-file schema resolution (M2): the whole tree on disk is the index.
  // Candidates for fetching = files that exist on disk and are not already
  // route contents. Mirrors the pipeline's bounded second round.
  let routes = parseRouteFiles(underCap);
  const gaps = schemaImportCandidates(routes);
  const diskByRel = new Map(files.map((f) => [f.rel, f]));
  const fetchable = new Map();
  let fetchCount = 0;
  for (const g of gaps) {
    for (const p of g.candidatePaths) {
      if (fetchCount >= 25) break;
      if (underCap.some((c) => c.path === p) || fetchable.has(p)) continue;
      if (!diskByRel.has(p)) continue;
      fetchable.set(p, diskByRel.get(p));
      fetchCount++;
    }
  }
  if (fetchable.size > 0) {
    const repoFiles = [...fetchable.values()].map((f) => ({ path: f.rel, content: readFileSync(f.full, "utf8") }));
    const cross = parseRouteFilesCrossFile(underCap, repoFiles);
    const resolvedBefore = routes.filter((r) => r.requestBody?.resolved).length;
    const resolvedAfter = cross.routes.filter((r) => r.requestBody?.resolved).length;
    console.log(
      `\nCross-file resolution (M2): ${gaps.length} unresolved body schema(s) -> fetched ${repoFiles.length} file(s) -> ${resolvedAfter - resolvedBefore} additional body/bodies resolved`,
    );
    routes = cross.routes;
  }

  const withMissingParams = routes.filter(
    (r) =>
      (r.dynamicSegments.length > 0 && r.params.length === 0) ||
      r.params.some((p) => !p.type || p.type === "unknown"),
  );
  const withOpaqueTypes = routes.filter(
    (r) => r.params.some((p) => p.type && !p.type.includes("{")),
  );

  console.log(`\n=== ${root} ===`);
  console.log(
    `Next.js route files: .ts/.tsx ${nextTs.length} | .js/.jsx ${nextJs.length} | other server-looking files ${other.length}`,
  );
  console.log(
    `Parsed under caps: ${underCap.length}/${nextTs.length} route files (cap ${MAX_FILES}, ${MAX_FILE_BYTES / 1024}KB)`,
  );

  console.log(`\nRoutes found: ${root ? routes.length : 0}`);
  for (const r of routes) console.log(`  ${fmtRoute(r)}`);
  if (routes.length === 0) console.log("  (none)");

  console.log(`\nRoutes with missing params or types: ${withMissingParams.length}`);
  for (const r of withMissingParams) {
    console.log(`  ${fmtRoute(r)}`);
    console.log(`    params: ${JSON.stringify(r.params)}`);
  }
  console.log(`Routes with opaque (unresolved-name) param types: ${withOpaqueTypes.length}`);

  const withBody = routes.filter((r) => r.requestBody);
  const bodyResolved = withBody.filter((r) => r.requestBody.resolved && r.requestBody.fields.length > 0);
  const bodyNamedGap = withBody.filter((r) => !r.requestBody.resolved);
  console.log(
    `Request bodies (M1): ${withBody.length} detected | ${bodyResolved.length} fully resolved | ${bodyNamedGap.length} named-but-external schema ("not documented in source")`,
  );
  for (const r of withBody.slice(0, 8)) {
    const fields = r.requestBody.resolved ? r.requestBody.fields.map((f) => f.name).join(", ") : "(external schema)";
    console.log(`  ${(r.method ?? "?").padEnd(6)} ${r.routePath} <- ${r.requestBody.schemaName ?? "inline"}: ${fields}`);
  }

  console.log(
    `\nSkipped: too-large ${tooLarge.length} | unreadable ${unreadable.length} | over-cap ${overCap.length}`,
  );
  for (const p of tooLarge) console.log(`  [too large] ${p}`);
  for (const p of unreadable) console.log(`  [unreadable] ${p}`);
  for (const p of overCap) console.log(`  [over cap] ${p.path}`);

  if (allFlag && other.length > 0) {
    const hits = sniffFrameworkRegistrations(other);
    const byFramework = new Map();
    for (const h of hits) byFramework.set(h.framework, (byFramework.get(h.framework) ?? 0) + 1);
    console.log(`\nNon-Next server files scanned for other frameworks: ${other.length}`);
    if (hits.length === 0) {
      console.log("  No Express/Fastify/NestJS registrations found in scanned files.");
    } else {
      for (const [fw, n] of byFramework) {
        console.log(`  ${fw}: registrations present in ${n} file(s) — NOT parseable by Docloom today`);
      }
      for (const h of hits.slice(0, 10)) console.log(`    e.g. ${h.rel}`);
    }
  }

  return {
    routes: routes.length,
    incomplete: withMissingParams.length,
    opaque: withOpaqueTypes.length,
    files: nextTs.length,
    nextJs: nextJs.length,
  };
}

const results = [];
for (const root of roots) {
  results.push({ root, ...reportForRoot(root) });
}

console.log("\n=== Summary across roots ===");
for (const r of results) {
  console.log(
    `${r.root}: ${r.routes} routes | ${r.incomplete} missing-params | ${r.opaque} opaque types | ${r.files} .ts route files (${r.nextJs} .js ignored by pipeline)`,
  );
}
