import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * P0.3 regression guard: when GitHub rate-limits the anonymous playground, the
 * route must (a) return the named github_rate_limited error rather than a
 * generic 500 and (b) fire the DOCLOOM_ALERT_WEBHOOK_URL alert so a missing
 * PLAYGROUND_GITHUB_TOKEN reaches ops before a prospect hits it.
 *
 * The pipeline itself is mocked (its own tests cover the mapping); this test
 * covers the route's wiring.
 */

const { dispatchAlertMock, runAfterMock } = vi.hoisted(() => ({
  dispatchAlertMock: vi.fn(async () => 1),
  // Run the deferred work inline so the assertion does not race the response.
  runAfterMock: vi.fn(async (fn: () => Promise<void>) => {
    await fn();
  }),
}));

vi.mock("@/lib/alerts", () => ({
  dispatchAlert: dispatchAlertMock,
  configuredSinks: () => ["test-sink"],
}));

vi.mock("@/lib/wait-until", () => ({ runAfterResponse: runAfterMock }));

vi.mock("@/lib/analytics", () => ({ track: () => {} }));

vi.mock("@/lib/playground", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/playground")>();
  return {
    ...actual,
    runPlaygroundGeneration: vi.fn(async () => ({
      status: 429,
      error: "github_rate_limited",
      message: "GitHub is rate-limiting the playground right now — please try again in a few minutes.",
    })),
  };
});

import { POST } from "./route";

function generateRequest(ip: string): NextRequest {
  return new Request("https://docloom.example/api/playground/generate", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ repo: "steven-tey/dub" }),
  }) as unknown as NextRequest;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/playground/generate", () => {
  it("returns the named rate-limit error and fires the ops alert", async () => {
    const res = await POST(generateRequest("203.0.113.10"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("github_rate_limited");
    expect(body.message).toMatch(/rate-limiting the playground/i);

    expect(dispatchAlertMock).toHaveBeenCalledTimes(1);
    const [alert, sinks] = dispatchAlertMock.mock.calls[0] as unknown as [
      { title: string; body: string; severity: string },
      unknown[],
    ];
    expect(alert.severity).toBe("warning");
    expect(alert.title).toMatch(/rate limit/i);
    expect(alert.body).toContain("steven-tey/dub");
    expect(alert.body).toContain("203.0.113.10");
    expect(sinks).toEqual(["test-sink"]);
  });
});
