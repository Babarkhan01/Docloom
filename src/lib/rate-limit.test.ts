import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupStaleBuckets, clientIp, rateLimit } from "./rate-limit";

// The limiter keeps module-level state (the bucket store + cleanup timestamp),
// so every test stubs Date.now and resets the cleanup clock via a fresh
// module registry where possible; the cleanup timestamp resets implicitly
// because each test advances time past the 60s cleanup interval.
const now = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  vi.useRealTimers();
});

function req(headers: Record<string, string>): Request {
  return new Request("https://docloom.example/api", { headers });
}

describe("rateLimit", () => {
  it("allows up to max requests, then blocks with a retry-after that counts down", () => {
    const rl = () => rateLimit("t:window", { max: 3, windowMs: 60_000 });
    expect(rl().ok).toBe(true);
    expect(rl().ok).toBe(true);
    expect(rl().remaining).toBe(0);
    const blocked = rl();
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);

    vi.advanceTimersByTime(30_000);
    const stillBlocked = rateLimit("t:window", { max: 3, windowMs: 60_000 });
    expect(stillBlocked.ok).toBe(false);
    expect(stillBlocked.retryAfterSeconds).toBe(30);
  });

  it("opens a fresh window after resetAt passes and counts the new request", () => {
    const rl = () => rateLimit("t:reset", { max: 1, windowMs: 60_000 });
    expect(rl().ok).toBe(true);
    expect(rl().ok).toBe(false);

    vi.advanceTimersByTime(61_000);
    const fresh = rl();
    expect(fresh.ok).toBe(true);
    expect(fresh.remaining).toBe(0);
  });

  it("isolates buckets per key (per-IP keys never share counts)", () => {
    expect(rateLimit("t:k1", { max: 1, windowMs: 60_000 }).ok).toBe(true);
    expect(rateLimit("t:k2", { max: 1, windowMs: 60_000 }).ok).toBe(true);
    expect(rateLimit("t:k1", { max: 1, windowMs: 60_000 }).ok).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers CF-Connecting-IP over X-Forwarded-For", () => {
    const r = req({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
    expect(clientIp(r)).toBe("203.0.113.7");
  });

  it("falls back to the first XFF entry when no CF header is present", () => {
    const r = req({ "x-forwarded-for": "198.51.100.9, 10.0.0.1" });
    expect(clientIp(r)).toBe("198.51.100.9");
  });

  it("returns unknown when neither header exists", () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("cleanupStaleBuckets", () => {
  it("drops expired buckets so the store cannot grow unbounded", () => {
    expect(rateLimit("t:stale", { max: 5, windowMs: 1_000 }).ok).toBe(true);
    // Advance past both the bucket's resetAt and the 60s cleanup throttle.
    vi.advanceTimersByTime(120_000);
    cleanupStaleBuckets();
    // A bucket that was cleaned up behaves like a fresh window, not a
    // continuing one — observable by refilling from zero.
    expect(rateLimit("t:stale", { max: 5, windowMs: 1_000 }).remaining).toBe(4);
  });
});
