/**
 * Anthropic Messages API transport — plain fetch only (Cloudflare
 * Workers-safe). Kept as the later-fallback provider; the AST structure
 * pipeline never talks to providers directly — everything goes through
 * src/lib/llm.ts's generateText().
 */
import { LlmTransportError, retryAfterFromHeaders, withRetry } from "./llm-shared";

export type AnthropicRequest = {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs: number;
  maxRetries: number;
};

export type AnthropicResponse = {
  text: string;
  tokensIn: number | null;
  tokensOut: number | null;
};

export async function callAnthropic(req: AnthropicRequest): Promise<AnthropicResponse> {
  const url = `${req.baseUrl.replace(/\/+$/, "")}/v1/messages`;
  const res = await withRetry(
    async () => {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": req.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          max_tokens: req.maxTokens,
          system: req.system,
          messages: [{ role: "user", content: req.prompt }],
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        }),
        signal: AbortSignal.timeout(req.timeoutMs),
      });
      if (r.ok) return r;
      let msg = `HTTP ${r.status}`;
      try {
        const b = await r.text();
        if (b) msg += `: ${b.slice(0, 300)}`;
      } catch {
        // body unreadable — status is enough
      }
      throw new LlmTransportError(r.status, retryAfterFromHeaders(r.headers), msg);
    },
    req.maxRetries,
  );

  const data = (await res.json().catch(() => null)) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  const text = (data?.content ?? []).find((c) => c.type === "text")?.text ?? "";
  if (!text) throw new LlmTransportError(502, null, "anthropic returned no text content");
  return {
    text,
    tokensIn: data?.usage?.input_tokens ?? null,
    tokensOut: data?.usage?.output_tokens ?? null,
  };
}
