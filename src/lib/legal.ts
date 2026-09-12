import fs from "node:fs";
import path from "node:path";

/**
 * Loads the legal markdown documents from /legal (project root, shipped with
 * the repo) for the static policy pages. Node runtime, read at build/prerender
 * time — static content, no DB, no auth, no app-logic dependencies.
 *
 * Content files are never modified by the app — the [placeholders] they
 * contain are intentionally rendered as-is until filled in.
 */

const LEGAL_DIR = path.join(process.cwd(), "legal");

export type LegalDoc = {
  slug: "privacy" | "terms" | "eula" | "cookies" | "refunds";
  title: string;
  markdown: string;
  /** True when template placeholders are still unfilled in the source file. */
  hasUnresolvedPlaceholders: boolean;
};

type LegalDocMeta = Pick<LegalDoc, "slug" | "title"> & { file: string };

const DOCS: LegalDocMeta[] = [
  { slug: "privacy", title: "Privacy Policy", file: "privacy-policy.md" },
  { slug: "terms", title: "Terms of Service", file: "terms-and-conditions.md" },
  { slug: "eula", title: "End User License Agreement", file: "eula.md" },
  { slug: "cookies", title: "Cookie Policy", file: "cookie-policy.md" },
  { slug: "refunds", title: "Refund Policy", file: "refund-policy.md" },
];

/** Placeholder tokens the docs still carry until real launch. */
export const PLACEHOLDER_TOKENS = [
  "[Insert Date]",
  "[Insert Jurisdiction",
  "[insert support/contact email]",
  "[Legal Entity Name / Founder Name]",
];

function findPlaceholders(markdown: string): string[] {
  return PLACEHOLDER_TOKENS.filter((token) => markdown.includes(token));
}

export function getLegalDoc(slug: LegalDoc["slug"]): LegalDoc {
  const doc = DOCS.find((d) => d.slug === slug);
  if (!doc) throw new Error(`Unknown legal doc: ${slug}`);

  const markdown = fs.readFileSync(path.join(LEGAL_DIR, doc.file), "utf8");
  return {
    slug: doc.slug,
    title: doc.title,
    markdown,
    hasUnresolvedPlaceholders: findPlaceholders(markdown).length > 0,
  };
}
