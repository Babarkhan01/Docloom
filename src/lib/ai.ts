import { getOptionalEnv } from "./env";
import { routeKey, } from "./docs";
import type { ParsedRoute } from "./route-parser";

/**
 * AI prose generation over AST-extracted facts. Per the PRD: the model writes
 * natural-language descriptions ONLY — structural facts arrive pre-parsed and
 * are never requested from (or trusted to) the model.
 *
 * Without ANTHROPIC_API_KEY the module runs in stub mode (empty map), letting
 * the pipeline produce fully structural docs for local development.
 */
const MODEL = "claude-sonnet-5";
const ENDPOINT = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 60_000;

export type DescribeResult = {
  descriptions: Map<string, string>;
  tokensUsed: number;
};

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function describeRoutes(routes: ParsedRoute[]): Promise<DescribeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { descriptions: new Map(), tokensUsed: 0 };

  const facts = routes.map((r) => ({
    key: routeKey(r),
    file: r.filePath,
    dynamicSegments: r.dynamicSegments,
    routeContextParams: r.params,
    readsRequest: r.hasRequestUsage,
    returnsResponse: r.returnsResponse,
    // Schema name + field names only — prose is grounded on these, never asked
    // to invent structure.
    requestBody: r.requestBody
      ? {
          schema: r.requestBody.schemaName,
          fields: r.requestBody.resolved ? r.requestBody.fields.map((f) => f.name) : null,
        }
      : undefined,
    jsdoc: r.jsdoc,
  }));

  const system =
    "You are a technical writer documenting HTTP APIs. You receive structural facts " +
    "extracted from source code by a compiler. Write ONE concise description (max 2 sentences) " +
    "per endpoint. Describe only what the facts imply — never invent parameters, types, " +
    "routes, auth behavior, or side effects. When the facts are ambiguous, describe the " +
    "unambiguous parts only. Respond with strict JSON, no markdown fences: " +
    '[{"key":"METHOD /path","description":"..."}] with one entry per input fact key.';

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: getOptionalEnv("ANTHROPIC_MODEL", MODEL),
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: JSON.stringify(facts, null, 2) }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Claude API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = (data.content ?? []).find((c) => c.type === "text")?.text ?? "";

  const descriptions = new Map<string, string>();
  try {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as { key?: string; description?: string }[];
      for (const item of parsed) {
        if (typeof item.key === "string" && typeof item.description === "string" && item.description.trim()) {
          descriptions.set(item.key, item.description.trim());
        }
      }
    }
  } catch {
    // Unparseable output → fall through; docs.ts uses JSDoc/placeholder fallbacks.
  }

  const tokensUsed = (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0);
  return { descriptions, tokensUsed };
}
