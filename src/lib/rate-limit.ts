import { rateLimitConfig } from "./env";

type Bucket = { count: number; resetAt: number };

/**
 * Minimal in-memory sliding-window rate limiter.
 * Per-process only — adequate for a single-instance MVP; swap for a shared
 * store (Redis/Upstash) once Docloom runs more than one instance.
 * All public endpoints must go through this (project principle).
 */
const store = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  opts: { max?: number; windowMs?: number } = {},
): { ok: boolean; remaining: number; retryAfterSeconds: number } {
  const { max = rateLimitConfig().max, windowMs = rateLimitConfig().windowMs } = opts;
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: max - 1, retryAfterSeconds: Math.ceil(windowMs / 1000) };
  }

  bucket.count += 1;
  if (bucket.count > max) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true, remaining: max - bucket.count, retryAfterSeconds: 0 };
}

/** Best-effort IP for rate limiting (works behind Cloudflare/proxies). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

/** Periodic cleanup so the store can't grow unbounded. */
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

export function cleanupStaleBuckets(now: number = Date.now()): void {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}