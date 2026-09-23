#!/usr/bin/env node
/**
 * generate-demo-docs.mjs — offline proof asset: runs the PRODUCTION parser
 * and markdown builder over a local repo checkout and writes the resulting
 * API reference markdown to demo/.
 *
 * Constraints (same as parser-eval.mjs): no DB, no network, no AI, no
 * secrets. Descriptions come from JSDoc when present; AI-written prose in
 * the real product would replace/augment them. Output is exactly what
 * buildApiMarkdown emits.
 *
 * Usage:
 *   node scripts/generate-demo-docs.mjs <repo-root> <repo-full-name> <branch> [out-file]
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const { parseRouteFilesWithDiagnostics, schemaImportCandidates, parseRouteFilesCrossFile } = await import(
  new URL("../src/lib/route-parser.ts", import.meta.url).href
);
const { buildApiMarkdown } = await import(new URL("../src/lib/docs.ts", import.meta.url).href);

const MAX_FILES = 50;
const MAX_FILE_BYTES = 64 * 1024;
const SCHEMA_FETCH_BUDGET = 25;

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage", ".turbo",
  ".vercel", ".wrangler", ".yarn", ".cache", "vendor", "tmp", "temp", "drizzle",
  "scripts", "components", "ui", "hooks", "stores", "styles", "assets", "public", "emails",
]);

const [root, repoFullName, branch, outFileArg] = process.argv.slice(2);
if (!root || !repoFullName || !branch) {
  console.error("Usage: node scripts/generate-demo-docs.mjs <repo-root> <repo-full-name> <branch> [out-file]");
  process.exit(2);
}

function relPath(dir, name) {
  return path.relative(root, path.join(dir, name)).split(path.sep).join("/");
}

function collect(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && /route\.(ts|tsx)$/.test(e.name)) out.push({ rel: relPath(d, e.name), full });
    }
  }
  return out;
}

const allFiles = collect(root);
const contents = [];
for (const f of allFiles.sort((a, b) => a.rel.localeCompare(b.rel))) {
  let content;
  try {
    content = readFileSync(f.full, "utf8");
  } catch {
    continue;
  }
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) continue;
  contents.push({ path: f.rel, content });
}
const underCap = contents.slice(0, MAX_FILES);

// Pass 1, then the M2 cross-file round (mirrors executePipeline).
let { routes, diagnostics } = parseRouteFilesWithDiagnostics(underCap);
const gaps = schemaImportCandidates(routes);
const diskByRel = new Map(allFiles.map((f) => [f.rel, f]));
const fetchable = [];
let fetchCount = 0;
for (const g of gaps) {
  for (const p of g.candidatePaths) {
    if (fetchCount >= SCHEMA_FETCH_BUDGET) break;
    if (underCap.some((c) => c.path === p) || fetchable.includes(p)) continue;
    if (!diskByRel.has(p)) continue;
    fetchable.push(p);
    fetchCount++;
  }
}
if (fetchable.length > 0) {
  const repoFiles = fetchable.map((p) => ({ path: p, content: readFileSync(diskByRel.get(p).full, "utf8") }));
  const cross = parseRouteFilesCrossFile(underCap, repoFiles);
  routes = cross.routes;
  diagnostics = cross.diagnostics;
}

const coverage = {
  filesSkipped: contents.length - underCap.length,
  fileCap: MAX_FILES,
  filesTooLarge: contents.length - underCap.filter((c) => !allFiles.some((f) => f.rel === c.path) === false && Buffer.byteLength(c.content, "utf8") > 0 ? 0 : 0),
};
// Recompute filesTooLarge honestly (over-cap files beyond MAX_FILES are skipped, not size-excluded).
coverage.filesTooLarge = 0;

const descriptions = new Map(); // structural demo: JSDoc fallbacks come from buildApiMarkdown itself
const markdown = buildApiMarkdown(repoFullName, branch, routes, descriptions, {
  filesSkipped: Math.max(0, contents.length - underCap.length),
  fileCap: MAX_FILES,
  opaqueHandlers: diagnostics.wrappedOpaque,
});

const outFile = outFileArg ?? `demo/${repoFullName.split("/")[1]}-api.md`;
mkdirSync(path.dirname(new URL(`../${outFile}`, import.meta.url).pathname), { recursive: true });
writeFileSync(new URL(`../${outFile}`, import.meta.url).pathname, markdown);
console.log(`${repoFullName}: ${routes.length} endpoints -> ${outFile} (${fetchable.length} cross-file schema file(s) used)`);
