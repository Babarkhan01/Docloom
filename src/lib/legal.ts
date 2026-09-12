/**
 * Legal documents for the policy pages (/privacy, /terms, /eula, /cookies,
 * /refunds). Content is inlined from legal/*.md by the generator script
 * (npm run legal:generate) into legal-content.generated.ts — Cloudflare
 * Workers have no filesystem, so the markdown must live in the bundle.
 *
 * Source of truth remains legal/*.md: edit there, regenerate, commit both.
 * The app never modifies document content — [placeholders] render as-is
 * until filled in.
 */

import { LEGAL_CONTENT, type LegalSlug } from "./legal-content.generated";

export type LegalDoc = {
  slug: LegalSlug;
  title: string;
  markdown: string;
  /** True when template placeholders are still unfilled in the source file. */
  hasUnresolvedPlaceholders: boolean;
};

const DOCS: Array<{ slug: LegalSlug; title: string }> = [
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "terms", title: "Terms of Service" },
  { slug: "eula", title: "End User License Agreement" },
  { slug: "cookies", title: "Cookie Policy" },
  { slug: "refunds", title: "Refund Policy" },
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

export function getLegalDoc(slug: LegalSlug): LegalDoc {
  const doc = DOCS.find((d) => d.slug === slug);
  const markdown = LEGAL_CONTENT[slug];
  if (!doc || typeof markdown !== "string") {
    throw new Error(`Unknown legal doc: ${slug}`);
  }

  return {
    slug: doc.slug,
    title: doc.title,
    markdown,
    hasUnresolvedPlaceholders: findPlaceholders(markdown).length > 0,
  };
}
