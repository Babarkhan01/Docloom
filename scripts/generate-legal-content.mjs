#!/usr/bin/env node
/**
 * Generates src/lib/legal-content.generated.ts from the markdown files in
 * /legal. The generated module inlines the documents as strings so the
 * policy pages render on Cloudflare Workers, where there is no filesystem
 * to read from at runtime.
 *
 * Re-run after editing any file in /legal:  npm run legal:generate
 * (then commit the regenerated file alongside the content change).
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const LEGAL_DIR = path.join(process.cwd(), "legal");
const OUT_FILE = path.join(process.cwd(), "src/lib/legal-content.generated.ts");

const DOCS = [
  { slug: "privacy", file: "privacy-policy.md" },
  { slug: "terms", file: "terms-and-conditions.md" },
  { slug: "eula", file: "eula.md" },
  { slug: "cookies", file: "cookie-policy.md" },
  { slug: "refunds", file: "refund-policy.md" },
];

const entries = DOCS.map(({ slug, file }) => {
  const markdown = readFileSync(path.join(LEGAL_DIR, file), "utf8");
  return `  ${slug}: ${JSON.stringify(markdown)},`;
}).join("\n");

const out = `/**
 * GENERATED FILE — do not edit by hand.
 * Source of truth: legal/*.md — regenerate with \`npm run legal:generate\`.
 *
 * The markdown is inlined (rather than read from disk at runtime) because
 * policy pages must render on Cloudflare Workers, which has no filesystem.
 */

export type LegalSlug = "privacy" | "terms" | "eula" | "cookies" | "refunds";

export const LEGAL_CONTENT: Record<LegalSlug, string> = {
${entries}
};
`;

writeFileSync(OUT_FILE, out);
console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)} (${DOCS.length} documents)`);
