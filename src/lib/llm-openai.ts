/**
 * OpenAI-compatible chat/completions transport for Groq and Nebius Token
 * Factory. Plain fetch only (Cloudflare Workers-safe). Singular URL shape:
 * {baseUrl}/chat/completions — Nebius's exact base URL is operator-supplied
 * via LLM_BASE_URL_NEBIUS (to be verified for the NVIDIA hackathon).
 */
import { LlmTransportError, retryAfterFromHeaders, withRetry } from "./llm-shared";

export type OpenAiRequest = {
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

export type OpenAiResponse = {
  text: string;
  tokensIn: number | null;
  tokensOut: number | null;
};

export async function callOpenAiCompatible(req: OpenAiRequest): Promise<OpenAiResponse> {
  const url = `${req.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const body = JSON.stringify({
    model: req.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.prompt },
    ],
    max_tokens: req.maxTokens,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
  });

  const headers = {
    Authorization: `Bearer ${req.apiKey}`,
    "Content-Type": "application/json",
  };

  const res = await withRetry(
    async () => {
      const r = await fetch(url, {
        method: "POST",
        headers,
        body,
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
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } | null;
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text) throw new LlmTransportError(502, null, "provider returned no choices/content");
  return {
    text,
    tokensIn: data?.usage?.prompt_tokens ?? null,
    tokensOut: data?.usage?.completion_tokens ?? null,
  };
}
