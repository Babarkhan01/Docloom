import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALL_PROVIDERS,
  assertPrivacyOk,
  generateText,
  LlmPrivacyError,
  LlmUnconfiguredError,
  providerConfig,
  providerReady,
} from "./llm";
import { LlmTransportError, withBackoff } from "./llm-shared";
import { flagInventedNames } from "./ai";
import type { ParsedRoute } from "./route-parser";

function okRes(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 5, completion_tokens: 6 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

/** Minimal ParsedRoute fixture for the post-check tests. */
function route(spec: {
  key: string;
  params?: string[];
  dynamicSegments?: string[];
  bodyFields?: string[];
  responseFields?: string[];
  inputNames?: string[];
}): ParsedRoute {
  const spaceAt = spec.key.indexOf(" ");
  const method = spaceAt >= 0 ? spec.key.slice(0, spaceAt) : "GET";
  const path = spaceAt >= 0 ? spec.key.slice(spaceAt + 1) : spec.key;
  return {
    filePath: `app/api${path}/route.ts`,
    sourceContent: "",
    routePath: path,
    method,
    dynamicSegments: spec.dynamicSegments ?? [],
    params: (spec.params ?? []).map((name) => ({ name, type: "string", kind: "url", typeResolved: true })),
    hasRequestUsage: false,
    returnsResponse: true,
    jsdoc: null,
    exportedSymbols: [],
    requestBody: spec.bodyFields
      ? {
          source: "zod",
          schemaName: "Body",
          resolved: true,
          fields: spec.bodyFields.map((name) => ({ name, type: "string", typeResolved: true })),
        }
      : undefined,
    responses: spec.responseFields
      ? [
          {
            source: "literal",
            resolved: true,
            status: 200,
            fields: spec.responseFields.map((name) => ({ name, type: "string", typeResolved: true })),
          },
        ]
      : undefined,
    inputs: (spec.inputNames ?? []).map((name) => ({
      kind: "query" as const,
      name,
      nameResolved: true,
      typed: true,
      schemaName: "Q",
      type: "string",
      typeResolved: true,
      multi: false,
    })),
  } as ParsedRoute;
}

describe("provider selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("supports exactly groq, nebius, anthropic", () => {
    expect(ALL_PROVIDERS).toEqual(["groq", "nebius", "anthropic"]);
  });

  it("model and key env names are per-provider; no hardcoded models", () => {
    vi.stubEnv("LLM_API_KEY_GROQ", "k");
    vi.stubEnv("GROQ_MODEL", "llama-test");
    const cfg = providerConfig("groq");
    expect(cfg.modelEnv).toBe("GROQ_MODEL");
    expect(cfg.apiKeyEnv).toBe("LLM_API_KEY_GROQ");
    expect(providerReady("groq")).toBe(true);
    vi.stubEnv("GROQ_MODEL", "");
    expect(providerReady("groq")).toBe(false);
  });

  it("groq has a default base URL; nebius REQUIRES LLM_BASE_URL_NEBIUS", () => {
    expect(providerConfig("groq").baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(() => providerConfig("nebius")).toThrow(LlmUnconfiguredError);
    vi.stubEnv("LLM_BASE_URL_NEBIUS", "https://tokenfactory.example/api");
    expect(providerConfig("nebius").baseUrl).toBe("https://tokenfactory.example/api");
  });

  it("generateText uses LLM_PROVIDER by default and sends the configured model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okRes("[{}]"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("LLM_API_KEY_GROQ", "test-key");
    vi.stubEnv("GROQ_MODEL", "test-model");

    const res = await generateText({ system: "s", prompt: "p", maxTokens: 10, repoPublic: true });
    expect(res.provider).toBe("groq");
    expect(res.model).toBe("test-model");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.groq.com/openai/v1/chat/completions");
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    expect(init.headers.Authorization).toBe("Bearer test-key"); // key goes to the API, never to logs
    expect(JSON.parse(init.body).model).toBe("test-model");
  });

  it("an unknown LLM_PROVIDER falls back to no provider", async () => {
    vi.stubEnv("LLM_PROVIDER", "mistral");
    vi.stubEnv("LLM_API_KEY_GROQ", "k");
    vi.stubEnv("GROQ_MODEL", "m");
    // explicit request still works even when the default is unknown
    const fetchMock = vi.fn().mockResolvedValue(okRes("[]"));
    vi.stubGlobal("fetch", fetchMock);
    const res = await generateText({ system: "s", prompt: "p", maxTokens: 5, repoPublic: true, provider: "groq" });
    expect(res.provider).toBe("groq");
  });
});

describe("retry and backoff (bounded, honors Retry-After)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("retries 429/5xx, waits max(backoff, Retry-After), then succeeds", async () => {
    const sleeps: number[] = [];
    const op = vi
      .fn()
      .mockRejectedValueOnce(new LlmTransportError(429, 20, "slow down"))
      .mockRejectedValueOnce(new LlmTransportError(503, null, "down"))
      .mockResolvedValueOnce("ok");

    const out = await withBackoff(op, { sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });
    expect(out).toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
    // Default ceiling: Retry-After(20s→20000ms) is clamped to maxDelayMs=15s;
    // attempt 2 (no Retry-After) gets plain backoff 500·2 = 1000ms.
    expect(sleeps).toEqual([15_000, 1_000]);

    // With the ceiling raised, a long Retry-After beats the short backoff.
    const sleeps2: number[] = [];
    const op2 = vi
      .fn()
      .mockRejectedValueOnce(new LlmTransportError(429, 20, "slow down"))
      .mockRejectedValueOnce(new LlmTransportError(429, null, "still"))
      .mockResolvedValueOnce("ok");
    await withBackoff(op2, {
      maxDelayMs: 25_000,
      deadlineMs: 45_000, // budget must exceed the longest single wait
      sleep: (ms) => { sleeps2.push(ms); return Promise.resolve(); },
    });
    expect(sleeps2).toEqual([20_000, 1_000]); // Retry-After(20s→20000ms) wins over 500·2^0=500ms… then 1000ms
  });

  it("does NOT retry non-retryable 4xx", async () => {
    const op = vi.fn().mockRejectedValue(new LlmTransportError(401, null, "bad key"));
    await expect(withBackoff(op, { sleep: () => Promise.resolve() })).rejects.toThrow(/bad key/);
    expect(op).toHaveBeenCalledTimes(1);
  });

  it("give up when the retry budget is exhausted", async () => {
    const op = vi.fn().mockRejectedValue(new LlmTransportError(429, null, "still limited"));
    await expect(
      withBackoff(op, { baseMs: 1, maxDelayMs: 2, deadlineMs: 5, sleep: () => Promise.resolve() }),
    ).rejects.toThrow(/budget exhausted/i);
    expect(op.mock.calls.length).toBeGreaterThan(1);
  });

  it("generateText retries a 429 against the transport (mocked fetch)", async () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("LLM_API_KEY_GROQ", "k");
    vi.stubEnv("GROQ_MODEL", "m");
    const limited = new Response("rate limited", { status: 429, headers: { "Retry-After": "1" } });
    const fetchMock = vi.fn().mockResolvedValueOnce(limited).mockResolvedValueOnce(okRes("[]"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await generateText({ system: "s", prompt: "p", maxTokens: 10, repoPublic: true });
    expect(res.text).toBe("[]");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.tokensIn).toBe(5);
    expect(res.tokensOut).toBe(6);
  }, 5_000); // honors a 1s Retry-After — keep the test timeout above it
});

describe("privacy gate (groq refusal for private repos)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("groq refuses private; nebius/anthropic allow; public always allowed", () => {
    expect(() => assertPrivacyOk("groq", false)).toThrow(LlmPrivacyError);
    expect(() => assertPrivacyOk("nebius", false)).not.toThrow();
    expect(() => assertPrivacyOk("anthropic", false)).not.toThrow();
    expect(() => assertPrivacyOk("groq", true)).not.toThrow();
  });

  it("ALLOW_PRIVATE_ON_GROQ=true is the explicit operator opt-in", () => {
    vi.stubEnv("ALLOW_PRIVATE_ON_GROQ", "true");
    expect(() => assertPrivacyOk("groq", false)).not.toThrow();
  });

  it("the gate runs BEFORE config checks on the generateText path", async () => {
    // No LLM_API_KEY_GROQ at all — if config ran first we'd see Unconfigured; gate must win.
    vi.stubEnv("ALLOW_PRIVATE_ON_GROQ", "");
    await expect(
      generateText({ system: "s", prompt: "p", maxTokens: 5, repoPublic: false, provider: "groq" }),
    ).rejects.toBeInstanceOf(LlmPrivacyError);
  });
});

describe("hallucination post-check (flagInventedNames)", () => {
  it("flags Capitalized/snake_case tokens absent from the AST facts", () => {
    const r = route({ key: "POST /users", bodyFields: ["email", "name"], inputNames: ["page"] });
    const descriptions = new Map([["POST /users", "Creates a user with Email and workspaceId fields."]]);
    const flagged = flagInventedNames([r], descriptions);
    // "email" is known case-insensitively (prose capitalized it, not invented);
    // camelCase workspaceId absent from the facts is the hallmark hallucination.
    expect(flagged.get("POST /users")).toEqual(["workspaceId"]);
  });

  it("passes grounded prose with zero flags", () => {
    const r = route({ key: "GET /users", inputNames: ["page"], responseFields: ["items", "page"], dynamicSegments: [] });
    const descriptions = new Map([["GET /users", "Lists users paginated by page; the response has items and page."]]);
    expect(flagInventedNames([r], descriptions).size).toBe(0);
  });

  it("known names pass from any fact source regardless of prose capitalization; unknowns still flag", () => {
    const r = route({
      key: "GET /workspaces/[ws]/stats",
      params: ["id"],
      dynamicSegments: ["ws"],
      responseFields: ["total"],
    });
    const descriptions = new Map([
      // Ws/Total are known names, capitalized by prose — must NOT flag.
      ["GET /workspaces/[ws]/stats", "The Ws and Total values come from the request."],
    ]);
    expect(flagInventedNames([r], descriptions).size).toBe(0);

    const unknown = new Map([["GET /workspaces/[ws]/stats", "Returns the Grandtotal value."]]);
    expect(flagInventedNames([r], unknown).get("GET /workspaces/[ws]/stats")).toEqual(["Grandtotal"]);
  });

  it("descriptions without a matching route are ignored", () => {
    const r = route({ key: "GET /a" });
    const descriptions = new Map([["DELETE /nope", "MadeUpField lives here."]]);
    expect(flagInventedNames([r], descriptions).size).toBe(0);
  });
});
