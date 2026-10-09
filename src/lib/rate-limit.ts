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

/**
 * Best-effort client IP for rate limiting.
 *
 * CF-Connecting-IP wins: Docloom runs behind Cloudflare, where the edge sets
 * it on every request and strips any client-supplied value — it cannot be
 * spoofed through the proxy. X-Forwarded-For's first entry, by contrast, is
 * whatever the caller sent (Cloudflare only appends the real IP), so an
 * attacker rotating a fake XFF header would get a fresh rate bucket per
 * request and defeat every per-IP cap. XFF remains the fallback for
 * non-Cloudflare environments (local dev, other proxies). With neither header
 * present every client shares the conservative "unknown" bucket rather than
 * bypassing the limits entirely.
 */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

/**
 * UTC-day-aligned counter on the same in-memory store. Keyed with the day so
 * stale days are naturally cleaned by cleanupStaleBuckets (resetAt = end of
 * that UTC day). Used for global daily spend guards (e.g. the playground's
 * LLM budget) that must reset on the calendar day, not on first use.
 */
function dayKey(key: string): string {
  return `${key}:${new Date().toISOString().slice(0, 10)}`;
}

export function dailyCount(key: string): { count: number } {
  const bucket = store.get(dayKey(key));
  return { count: bucket && bucket.resetAt > Date.now() ? bucket.count : 0 };
}

export function bumpDailyCount(key: string): number {
  const full = dayKey(key);
  const existing = store.get(full);
  const count = (existing && existing.resetAt > Date.now() ? existing.count : 0) + 1;
  const endOfDay = Date.parse(`${new Date().toISOString().slice(0, 10)}T23:59:59.999Z`);
  store.set(full, { count, resetAt: endOfDay });
  return count;
}

/** Test hook: clear the whole in-memory store (per-process like the limiter). */
export function __resetRateLimitStoreForTests(): void {
  store.clear();
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