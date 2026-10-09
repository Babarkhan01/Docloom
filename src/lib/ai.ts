/**
 * AI prose generation over AST-extracted facts. Per the PRD: the model writes
 * natural-language descriptions ONLY — structural facts arrive pre-parsed and
 * are never requested from (or trusted to) the model.
 *
 * Providers: groq (free tier, PUBLIC repos only — the gateway's privacy gate
 * throws LlmPrivacyError otherwise), nebius, anthropic (later). Without
 * LLM_PROVIDER the module runs in stub mode (empty map), letting the pipeline
 * produce fully structural docs locally and in the public playground.
 */
import { generateText, LlmError, type ProviderId } from "./llm";
import { routeKey } from "./docs";
import type { ParsedRoute } from "./route-parser";

export type DescribeResult = {
  descriptions: Map<string, string>;
  tokensUsed: number;
  /** Provider actually used for this batch (null = stub/no-AI path). */
  provider: ProviderId | null;
  /**
   * Flagged, not dropped: per route key, prose tokens that look like
   * parameter/field names but are absent from the AST facts for that handler.
   */
  flagged: Map<string, string[]>;
};

/** The env-configured default provider, or null when unset/unknown. */
export function activeProviderName(): ProviderId | null {
  const name = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (name === "groq" || name === "nebius" || name === "anthropic") return name;
  return null;
}

export function aiEnabled(): boolean {
  return activeProviderName() !== null;
}

const SYSTEM_PROMPT =
  "You are a technical writer documenting HTTP APIs. You receive structural facts " +
  "extracted from source code by a compiler. Write ONE concise description (max 2 sentences) " +
  "per endpoint. Describe only what the facts imply — never invent parameters, types, " +
  "routes, auth behavior, or side effects. When the facts are ambiguous, describe the " +
  "unambiguous parts only. Respond with strict JSON, no markdown fences: " +
  '[{"key":"METHOD /path","description":"..."}] with one entry per input fact key.';

/** Parse the model's strict-JSON array into a key→description map (empty on unparseable). */
function parseDescriptions(text: string): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { key?: string; description?: string }[];
      for (const item of parsed) {
        if (typeof item.key === "string" && typeof item.description === "string" && item.description.trim()) {
          out.set(item.key, item.description.trim());
        }
      }
    }
  } catch {
    // Unparseable output → empty map; docs.ts uses JSDoc/placeholder fallbacks.
  }
  return out;
}

/**
 * Run one provider call for a batch of parsed routes.
 *
 * `repoPublic` is a per-batch fact — every route in a generation comes from
 * the same repo. The gateway throws LlmPrivacyError when `provider` is groq
 * and the source is private (unless ALLOW_PRIVATE_ON_GROQ=true).
 */
export async function describeRoutes(routes: ParsedRoute[], repoPublic: boolean): Promise<DescribeResult> {
  const provider = activeProviderName();
  if (!provider) return { descriptions: new Map(), tokensUsed: 0, provider: null, flagged: new Map() };

  const facts = routes.map((r) => ({
    key: routeKey(r),
    file: r.filePath,
    dynamicSegments: r.dynamicSegments,
    routeContextParams: (r.params ?? []).map((p) => ({ name: p.name, provenance: p.kind })),
    readsRequest: r.hasRequestUsage,
    returnsResponse: r.returnsResponse,
    // Schema name + field names only — prose is grounded on these, never
    // asked to invent structure.
    requestBody: r.requestBody
      ? {
          schema: r.requestBody.schemaName,
          fields: r.requestBody.resolved ? r.requestBody.fields.map((f) => f.name) : null,
        }
      : undefined,
    // Response facts the same way: statuses + field names only.
    responses: r.responses?.length
      ? r.responses.map((s) => ({
          status: s.status ?? null,
          fields: s.resolved ? s.fields.map((f) => f.name) : null,
        }))
      : undefined,
    // Query/header inputs: proven names (+ types when provable) only.
    inputs: r.inputs?.length
      ? r.inputs.map((i) => ({
          kind: i.kind,
          name: i.nameResolved ? i.name : null,
          type: i.typed && i.typeResolved ? i.type : null,
        }))
      : undefined,
    jsdoc: r.jsdoc,
  }));

  try {
    const res = await generateText({
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(facts, null, 2),
      maxTokens: 4096,
      repoPublic,
      provider,
    });

    const descriptions = parseDescriptions(res.text);
    const flagged = flagInventedNames(routes, descriptions);
    return {
      descriptions,
      tokensUsed: (res.tokensIn ?? 0) + (res.tokensOut ?? 0),
      provider,
      flagged,
    };
  } catch (err) {
    if (err instanceof LlmError) {
      // Repack with the provider id so route-wrapper/health can attribute it.
      throw new LlmError(err.provider, err.message);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Hallucination post-check
// ---------------------------------------------------------------------------

/**
 * Per route key: prose tokens that look like field/parameter names but are
 * absent from the AST facts for that handler. Only IDENTIFIER-SHAPED tokens
 * count — camelCase, snake_case, or a backticked code span. Bare Capitalized
 * words are ordinary prose or proper nouns (Retrieves, GitHub, Dodo) and are
 * never flagged; the tradeoff is a PascalCase hallucination is not caught —
 * accepted, because the alternative flooded every description with false
 * positives and made the check unactionable.
 *
 * Flagged tokens match none of: route-context param names, dynamic segments,
 * request body fields, response fields, query/header input names
 * (case-insensitively).
 */
export function flagInventedNames(
  routes: ParsedRoute[],
  descriptions: Map<string, string>,
): Map<string, string[]> {
  const byKey = new Map<string, ParsedRoute>();
  for (const r of routes) byKey.set(routeKey(r), r);

  const out = new Map<string, string[]>();
  for (const [key, description] of descriptions) {
    const route = byKey.get(key);
    if (!route) continue; // unknown key: dropped at parse time, nothing to flag against

    const known = new Set<string>();
    const add = (names: Iterable<string>) => {
      for (const n of names) if (n) known.add(n.toLowerCase());
    };
    add((route.params ?? []).map((p) => p.name));
    add(route.dynamicSegments);
    if (route.requestBody?.resolved) add(route.requestBody.fields.map((f) => f.name));
    if (route.responses) for (const s of route.responses) if (s.resolved) add(s.fields.map((f) => f.name));
    if (route.inputs) add(route.inputs.filter((i) => i.nameResolved).map((i) => i.name));

    // Identifier candidates: every word inside a backticked span (explicitly
    // identifier-position, any casing), plus bare words outside spans when
    // they are camelCase or contain a snake_case underscore.
    const mentioned: string[] = [];
    const spans = [...description.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    for (const span of spans) mentioned.push(...(span.match(/[A-Za-z][A-Za-z0-9_]*/g) ?? []));
    const bare = description.replace(/`[^`]*`/g, " ").match(/[A-Za-z][A-Za-z0-9_]*/g) ?? [];
    mentioned.push(...bare);

    const invented = mentioned.filter((w) => {
      // Identifier shapes only: camelCase (the hallmark LLM invention:
      // workspaceId, createdAt) or anything with a snake_case underscore.
      const isIdentifierish = /^[a-z]+[A-Z]/.test(w) || /^[a-z0-9]+(_[a-z0-9]+)+$/i.test(w);
      if (!isIdentifierish) return false;
      return !known.has(w.toLowerCase()); // known names match case-insensitively
    });
    if (invented.length > 0) out.set(key, [...new Set(invented)]);
  }
  return out;
}
