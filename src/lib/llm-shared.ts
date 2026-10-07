/**
 * Shared types + retry engine for LLM HTTP transports (plain fetch only —
 * runs on Cloudflare Workers; no Node/SDK imports).
 */
export class LlmTransportError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds: number | null,
    message: string,
  ) {
    super(message);
    this.name = "LlmTransportError";
  }
}

/** HTTP error statuses worth retrying (429/5xx); other 4xx fail fast. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Parse the Retry-After header (seconds form) when the API sends one. */
export function retryAfterFromHeaders(h: Headers): number | null {
  const v = h.get("retry-after");
  if (!v) return null;
  const n = Number(v.trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 120);
}

export type BackoffOptions = {
  /** First delay in ms (default 500). */
  baseMs?: number;
  /** Growth per attempt (default 2). */
  factor?: number;
  /** Delay ceiling in ms (default 15_000). */
  maxDelayMs?: number;
  /** Total give-up budget across sleeps (default 20_000). */
  deadlineMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

/**
 * Bounded exponential backoff that respects the server's Retry-After when
 * present — the wait for attempt n is max(base·factor^(n−1), retryAfter),
 * clamped to maxDelayMs, until the deadline budget is exhausted.
 */
export async function withBackoff<T>(
  op: () => Promise<T>,
  opts: BackoffOptions = {},
): Promise<T> {
  const base = opts.baseMs ?? 500;
  const factor = opts.factor ?? 2;
  const max = opts.maxDelayMs ?? 15_000;
  const deadline = Date.now() + (opts.deadlineMs ?? 20_000);
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

  let attempt = 0;
  for (;;) {
    try {
      return await op();
    } catch (err) {
      if (!(err instanceof LlmTransportError) || !isRetryableStatus(err.status)) throw err;
      attempt++;
      const backoff = Math.min(base * Math.pow(factor, attempt - 1), max);
      // Retry-After is in SECONDS; backoff is ms — convert before comparing,
      // or a long Retry-After silently loses to a short backoff.
      const wait = Math.min(Math.max(backoff, (err.retryAfterSeconds ?? 0) * 1000), max);
      if (Date.now() + wait >= deadline) {
        throw new LlmTransportError(
          err.status,
          err.retryAfterSeconds,
          `Retry budget exhausted after ${attempt} attempt(s): ${err.message}`,
        );
      }
      await sleep(wait);
    }
  }
}

/** Transport-facing wrapper: retry `op` at most `maxRetries` extra times. */
export async function withRetry<T>(op: () => Promise<T>, maxRetries: number): Promise<T> {
  return withBackoff(op, { deadlineMs: 500 * Math.pow(2, maxRetries) + 20_000 });
}
