import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for GET /api/health.
 *
 * The load-bearing guarantee: a plain monitor GET must never reach the DB.
 * Docloom runs on Neon's free plan, where compute suspends after ~5 idle
 * minutes — a health check that ran `select 1` on every ping kept the
 * database awake around the clock. The deep probe is authenticated so a
 * stranger cannot wake compute through the endpoint.
 */

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn(async () => ({ rows: [{ "?column?": 1 }] })),
}));

vi.mock("@/lib/db", () => ({ db: { execute: executeMock } }));
vi.mock("@/lib/ai", () => ({ activeProviderName: () => "groq" }));
vi.mock("@/lib/llm", () => ({ lastLlmFailure: () => null }));
vi.mock("@/lib/playground", () => ({ playgroundLlmFallback: () => false }));

import { GET } from "./route";

const CRON_SECRET = "test-cron-secret";
const originalSecret = process.env.DOCLOOM_CRON_SECRET;

function healthRequest(query = "", authorization?: string): Request {
  return new Request(`https://docloom.example/api/health${query}`, {
    headers: authorization ? { authorization } : {},
  });
}

type HealthBody = {
  status?: string;
  db?: string;
  llmProvider?: string;
  playgroundLlmFallback?: boolean;
  error?: string;
};

beforeEach(() => {
  executeMock.mockReset();
  executeMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  process.env.DOCLOOM_CRON_SECRET = CRON_SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.DOCLOOM_CRON_SECRET;
  else process.env.DOCLOOM_CRON_SECRET = originalSecret;
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("answers 200 with db=skipped and never queries the database", async () => {
    const res = await GET(healthRequest());

    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe("ok");
    expect(body.db).toBe("skipped");
    expect(body.llmProvider).toBe("groq");
    expect(body.playgroundLlmFallback).toBe(false);
    // No accidental extra fields (no secret, no connection details).
    expect(Object.keys(body).sort()).toEqual([
      "db",
      "llmProvider",
      "playgroundLlmFallback",
      "status",
    ]);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("does not treat ?deep=0 as a deep check", async () => {
    const res = await GET(healthRequest("?deep=0"));

    expect(res.status).toBe(200);
    expect(((await res.json()) as HealthBody).db).toBe("skipped");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("401s a deep check with no credentials and stays off the database", async () => {
    const res = await GET(healthRequest("?deep=1"));

    expect(res.status).toBe(401);
    expect(((await res.json()) as HealthBody).error).toBe("unauthorized");
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("401s a deep check with the wrong secret and stays off the database", async () => {
    const res = await GET(healthRequest("?deep=1", "Bearer not-the-secret"));

    expect(res.status).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("fails closed when no cron secret is configured", async () => {
    delete process.env.DOCLOOM_CRON_SECRET;

    const res = await GET(healthRequest("?deep=1", `Bearer ${CRON_SECRET}`));

    expect(res.status).toBe(401);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it("runs the DB probe with ?deep=1 and the cron secret", async () => {
    const res = await GET(healthRequest("?deep=1", `Bearer ${CRON_SECRET}`));

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });

  it("503s a deep check when the database is unreachable", async () => {
    executeMock.mockRejectedValueOnce(new Error("connection refused"));

    const res = await GET(healthRequest("?deep=1", `Bearer ${CRON_SECRET}`));

    expect(executeMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(503);
    const body = (await res.json()) as HealthBody;
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("error");
  });
});
