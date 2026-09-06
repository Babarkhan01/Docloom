import type { ParsedRoute } from "./route-parser";

/**
 * Combine compiler-extracted facts with AI-written prose into structured
 * markdown. The facts (methods, paths, params) come only from the AST;
 * descriptions come from the AI (or JSDoc/placeholder fallbacks).
 */
export function routeKey(r: ParsedRoute): string {
  return `${r.method ?? "?"} ${r.routePath}`;
}

export function buildApiMarkdown(
  repoFullName: string,
  branch: string,
  routes: ParsedRoute[],
  descriptions: Map<string, string>,
): string {
  const lines: string[] = [];
  lines.push(`# ${repoFullName} — API Reference`);
  lines.push("");
  lines.push(
    `Structural facts below were extracted from the source at branch \`${branch}\` with a TypeScript AST parser; descriptions are AI-written from those facts only.`,
  );
  lines.push("");

  if (routes.length === 0) {
    lines.push("## Endpoints");
    lines.push("");
    lines.push(
      "No HTTP endpoints were detected in this repository. Docloom currently indexes Next.js App Router route handlers (`route.ts` / `route.tsx` files). Connect a repository with API routes to generate endpoint documentation.",
    );
    lines.push("");
    return lines.join("\n");
  }

  lines.push(`## Endpoints (${routes.length})`);
  lines.push("");
  lines.push("| Method | Path | Description |");
  lines.push("|---|---|---|");
  for (const r of routes) {
    const desc = (descriptions.get(routeKey(r)) ?? "").replace(/\|/g, "\\|").split("\n")[0];
    lines.push(`| ${r.method ?? "?"} | \`${r.routePath}\` | ${desc} |`);
  }
  lines.push("");

  // Group handlers by path so every method of an endpoint sits together.
  const byPath = new Map<string, ParsedRoute[]>();
  for (const r of routes) {
    const list = byPath.get(r.routePath) ?? [];
    list.push(r);
    byPath.set(r.routePath, list);
  }

  lines.push("## Reference");
  lines.push("");
  for (const [path, handlers] of byPath) {
    lines.push(`### ${path}`);
    lines.push("");
    for (const r of handlers) {
      lines.push(`#### ${routeKey(r)}`);
      lines.push("");
      lines.push(descriptions.get(routeKey(r)) ?? r.jsdoc ?? "_No description available._");
      lines.push("");
      lines.push("**Details**");
      lines.push("");
      lines.push(`- Source: \`${r.filePath}\``);
      if (r.dynamicSegments.length) {
        lines.push(`- Dynamic segments: ${r.dynamicSegments.map((s) => `\`[${s}]\``).join(", ")}`);
      }
      if (r.params.length) {
        lines.push("- Route context:");
        for (const p of r.params) lines.push(`  - \`${p.name}\`: \`${p.type}\``);
      } else {
        lines.push("- Route context: none");
      }
      lines.push(`- Reads the request: ${r.hasRequestUsage ? "yes" : "no"}`);
      lines.push(`- Returns a Response: ${r.returnsResponse ? "yes" : "no"}`);
      if (r.exportedSymbols.length) {
        lines.push(`- Exports: ${r.exportedSymbols.map((s) => `\`${s}\``).join(", ")}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
