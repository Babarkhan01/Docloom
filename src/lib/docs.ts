import type { ParsedRoute } from "./route-parser";

/**
 * Combine compiler-extracted facts with AI-written prose into structured
 * markdown. The facts (methods, paths, params) come only from the AST;
 * descriptions come from the AI (or JSDoc/placeholder fallbacks).
 */
export function routeKey(r: ParsedRoute): string {
  return `${r.method ?? "?"} ${r.routePath}`;
}

/**
 * Honest-coverage facts for a run — what we parsed and what we couldn't.
 * Every gap named here is a real gap: endpoints defined in skipped files are
 * missing from the output, and unresolvable handlers are named individually.
 * Nothing is guessed: unresolvable == "not documented in source".
 */
export type GenerationCoverage = {
  /** Candidate route files beyond the run's file cap — endpoints there are missing. */
  filesSkipped: number;
  fileCap: number;
  /** Candidate files excluded for size before the cap (today: silently, so we say so here). */
  filesTooLarge?: number;
  /** Candidates excluded before parsing for other reasons (e.g. pipeline only fetches .ts/.tsx). */
  filesExcludedOther?: number;
  /** Route files whose method exports could not be resolved to a handler function. */
  filesWithOpaqueHandlers?: number;
  /** Individual unresolvable handler exports (method + file), for the docs draft. */
  opaqueHandlers?: { method: string; filePath: string }[];
  /** Detected server framework when it is NOT App Router (e.g. "Express", "NestJS"). */
  unsupportedFramework?: string | null;
};

/** Top-of-doc summary: what we parsed / what we couldn't. */
function coverageNoteLines(coverage: GenerationCoverage): string[] {
  const lines: string[] = [];
  const parts: string[] = [];
  if (coverage.filesSkipped > 0) {
    parts.push(
      `${coverage.filesSkipped} route file${coverage.filesSkipped === 1 ? " was" : "s were"} not scanned (file cap: ${coverage.fileCap})`,
    );
  }
  if (coverage.filesTooLarge && coverage.filesTooLarge > 0) {
    parts.push(
      `${coverage.filesTooLarge} file${coverage.filesTooLarge === 1 ? " was" : "s were"} skipped for exceeding the size limit`,
    );
  }
  if (coverage.filesExcludedOther && coverage.filesExcludedOther > 0) {
    parts.push(`${coverage.filesExcludedOther} candidate file${coverage.filesExcludedOther === 1 ? " was" : "s were"} excluded before parsing`);
  }
  if (parts.length > 0) {
    lines.push(
      `> **Coverage note:** ${parts.join("; ")}, so endpoints defined there are missing from this document.`,
      "",
    );
  }
  if (coverage.opaqueHandlers && coverage.opaqueHandlers.length > 0) {
    const n = coverage.opaqueHandlers.length;
    lines.push(
      `> **Not documented in source:** ${n} handler export${n === 1 ? " was" : "s were"} found but could not be resolved to a handler function in the same file, so ${n === 1 ? "it is" : "they are"} not documented in source.`,
      "",
    );
  }
  if (coverage.unsupportedFramework) {
    lines.push(
      `> **Framework note:** this repository appears to use ${coverage.unsupportedFramework} for its HTTP endpoints. Docloom currently indexes Next.js App Router route handlers (\`route.ts\` / \`route.tsx\` files), so those endpoints are not documented in source.`,
      "",
    );
  }
  return lines;
}

export function buildApiMarkdown(
  repoFullName: string,
  branch: string,
  routes: ParsedRoute[],
  descriptions: Map<string, string>,
  coverage?: GenerationCoverage,
): string {
  const lines: string[] = [];
  lines.push(`# ${repoFullName} — API Reference`);
  lines.push("");
  lines.push(
    `Structural facts below were extracted from the source at branch \`${branch}\` with a TypeScript AST parser; descriptions are AI-written from those facts only.`,
  );
  lines.push("");
  if (coverage) lines.push(...coverageNoteLines(coverage));

  if (routes.length === 0) {
    lines.push("## Endpoints");
    lines.push("");
    if (coverage?.unsupportedFramework) {
      lines.push(
        `No Next.js route handlers were detected in this repository — its API appears to be built with ${coverage.unsupportedFramework}, which Docloom does not parse yet, so no endpoints are documented in source.`,
      );
    } else {
      lines.push(
        "No HTTP endpoints were detected in this repository. Docloom currently indexes Next.js App Router route handlers (`route.ts` / `route.tsx` files). Connect a repository with API routes to generate endpoint documentation.",
      );
    }
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
      if (r.wrapped && r.wrappedVia) lines.push(`- Handler: wrapped via \`${r.wrappedVia}\``);
      if (r.dynamicSegments.length) {
        lines.push(`- Dynamic segments: ${r.dynamicSegments.map((s) => `\`[${s}]\``).join(", ")}`);
      }
      if (r.params.length) {
        lines.push("- Parameters:");
        for (const p of r.params) {
          const typeText = p.typeResolved && p.type ? `\`${p.type}\`` : "not documented in source";
          lines.push(`  - \`${p.name}\` (${p.kind}): ${typeText}`);
        }
      } else {
        lines.push("- Route context: none");
      }
      if (r.requestBody) {
        lines.push(`- Request body (zod${r.requestBody.schemaName ? `: \`${r.requestBody.schemaName}\`` : ""})`);
        if (r.requestBody.resolved && r.requestBody.fields.length > 0) {
          for (const f of r.requestBody.fields) {
            const typeText = f.typeResolved && f.type ? `\`${f.type}\`` : "not documented in source";
            const extras: string[] = [];
            if (f.optional) extras.push("optional");
            if (f.defaultValue !== undefined) extras.push(`default \`${f.defaultValue}\``);
            for (const c of f.constraints) extras.push(`\`${c}\``);
            const suffix = extras.length ? ` — ${extras.join(", ")}` : "";
            lines.push(`  - \`${f.name}\`: ${typeText}${suffix}`);
          }
        } else if (r.requestBody.schemaName) {
          lines.push(`  - Fields: not documented in source (schema \`${r.requestBody.schemaName}\` could not be resolved to plain fields)`);
        } else {
          lines.push("  - Fields: not documented in source");
        }
      }
      if (r.responses && r.responses.length > 0) {
        lines.push(`- Responses (${r.responses.length}):`);
        for (const s of r.responses) {
          const head = `  - ${s.status ? `\`${s.status}\`` : "status not written"} (${s.source}${s.typeName ? `: \`${s.typeName}\`` : ""})`;
          if (s.resolved && s.fields.length > 0) {
            lines.push(head);
            for (const f of s.fields) {
              const typeText = f.typeResolved && f.type ? `\`${f.type}\`` : "not documented in source";
              lines.push(`    - \`${f.name}\`: ${typeText}`);
            }
          } else if (s.source === "annotation" && s.typeName) {
            lines.push(`${head} — declared return type; fields not documented in source`);
          } else {
            lines.push(`${head} — fields not documented in source`);
          }
        }
      }
      if (r.inputs && r.inputs.length > 0) {
        const render = (kind: "query" | "header", label: string): void => {
          const list = r.inputs!.filter((i) => i.kind === kind);
          if (list.length === 0) return;
          lines.push(`- ${label}:`);
          for (const i of list) {
            const nameText = i.nameResolved && i.name ? `\`${i.name}\`` : "not documented in source";
            if (i.typed && i.typeResolved && i.type) {
              const multi = i.multi ? " (repeated)" : "";
              lines.push(`  - ${nameText}${multi}: \`${i.type}\``);
            } else {
              const extra = i.multi ? " (repeated)" : "";
              const schema = i.schemaName ? ` (schema \`${i.schemaName}\` matched the name but could not be resolved to a type)` : "";
              lines.push(`  - ${nameText}${extra}: type not documented in source${schema}`);
            }
          }
        };
        render("query", "Query parameters");
        render("header", "Headers");
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

/** Aggregate counts for the draft/preview UI summary. */
export function routeCoverageCounts(routes: ParsedRoute[]): {
  total: number;
  incompleteParams: number;
  opaqueTypes: number;
  wrapped: number;
  withRequestBody: number;
  withResponses: number;
  withInputs: number;
} {
  return {
    total: routes.length,
    incompleteParams: routes.filter((r) => r.dynamicSegments.length > 0 && r.params.length === 0).length,
    opaqueTypes: routes.filter((r) => r.params.some((p) => !p.typeResolved)).length,
    wrapped: routes.filter((r) => r.wrapped === true).length,
    withRequestBody: routes.filter((r) => r.requestBody !== undefined && r.requestBody !== null).length,
    withResponses: routes.filter((r) => (r.responses?.length ?? 0) > 0).length,
    withInputs: routes.filter((r) => (r.inputs?.length ?? 0) > 0).length,
  };
}

/** The counts the UI coverage line shows (subset of routeCoverageCounts). */
export type RouteCoverageSummary = {
  total: number;
  untypedParams: number;
  wrapped: number;
  withRequestBody: number;
  withResponses: number;
  withInputs: number;
};

/**
 * Read the coverage summary back out of a *finished* markdown draft. Used by
 * the UI, which only has the stored markdown (facts are never persisted), so
 * counts are re-derived from the document's own headings/lines rather than
 * re-parsing source. Mirrors what buildApiMarkdown emits:
 *  - total endpoints: the "## Endpoints (N)" heading,
 *  - untyped params: detail lines of the form "- `name` (kind): not documented in source",
 *  - wrapped handlers: detail lines "- Handler: wrapped via `name".
 * Unknown formats yield 0s (the UI renders nothing for 0 counts), never guesses.
 */
export function coverageSummaryFromMarkdown(markdown: string): RouteCoverageSummary {
  const totalMatch = markdown.match(/^## Endpoints \((\d+)\)$/m);
  const total = totalMatch ? Number(totalMatch[1]) : 0;
  if (!totalMatch || !Number.isFinite(total) || total <= 0) {
    return { total: 0, untypedParams: 0, wrapped: 0, withRequestBody: 0, withResponses: 0, withInputs: 0 };
  }

  // Detail sections only — the Reference part, so the summary table (which
  // contains none of these lines) can't inflate the counts.
  const referenceIdx = markdown.indexOf("\n## Reference");
  const reference = referenceIdx >= 0 ? markdown.slice(referenceIdx) : "";
  const referenceLines = reference.split("\n");
  const untypedParams = referenceLines.filter((l) => /^\s+- `[^`]+` \((?:url|context)\): not documented in source$/.test(l)).length;
  // Handler lines are top-level list items (column 0); param lines are nested.
  const wrapped = referenceLines.filter((l) => /^\s*- Handler: wrapped via `.+`$/.test(l)).length;
  // "- Request body (zod…)" marks an endpoint with a validated body fact.
  const withRequestBody = referenceLines.filter((l) => /^\s*- Request body \(zod/.test(l)).length;
  // "- Responses (N):" marks an endpoint with at least one provable response shape.
  const withResponses = referenceLines.filter((l) => /^\s*- Responses \(\d+\):$/.test(l)).length;
  // "- Query parameters:" / "- Headers:" mark an endpoint with provable inputs.
  const withInputs = referenceLines.filter((l) => /^\s*- (?:Query parameters|Headers):$/.test(l)).length;

  return { total, untypedParams, wrapped, withRequestBody, withResponses, withInputs };
}
