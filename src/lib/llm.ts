/**
 * The one LLM gateway every description-producing caller uses. The AST
 * parser produces structure; this module only carries prose. Callers pass
 * two facts:
 *
 *   - `provider` — which provider config to honor (default: LLM_PROVIDER)
 *   - `repoPublic` — whether the source being described is from a PUBLIC repo.
 *
 * The gateway enforces the privacy gate (the groq provider refuses private
 * repos unless ALLOW_PRIVATE_ON_GROQ=true) and the per-provider concurrency
 * cap (free-tier endpoints are not hammered). Plain fetch transports only —
 * Cloudflare Workers-safe, no Node/SDK imports.
 */
import { getOptionalEnv, getOptionalNumberEnv, getOptionalBooleanEnv } from "./env-ext";
import { callOpenAiCompatible } from "./llm-openai";
import { callAnthropic } from "./llm-anthropic";
import { Semaphore } from "./concurrency";

export type ProviderId = "groq" | "nebius" | "anthropic";

export type LlmRequest = {
  system: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  /** Override the env-selected provider for one call. */
  provider?: ProviderId;
  /** True only when the source being described is from a public repo. */
  repoPublic: boolean;
};

export type LlmResult = {
  text: string;
  provider: ProviderId;
  model: string | null;
  /** API-reported usage when the provider returns it. */
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number;
};

export class LlmError extends Error {
  constructor(
    readonly provider: ProviderId | null,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export class LlmPrivacyError extends LlmError {
  constructor(provider: ProviderId, message: string) {
    super(provider, message);
    this.name = "LlmPrivacyError";
  }
}

export class LlmUnconfiguredError extends LlmError {
  constructor(provider: ProviderId | null, missing: string[]) {
    super(provider, `provider not configured — missing env: ${missing.join(", ")}`);
    this.name = "LlmUnconfiguredError";
  }
}

// ---------------------------------------------------------------------------
// Provider configuration — every value from env, no hardcoded model names
// ---------------------------------------------------------------------------

export type ProviderConfig = {
  id: ProviderId;
  /** Chat-completions root; the transport appends /chat/completions or /v1/messages. */
  baseUrl: string;
  apiKeyEnv: string;
  modelEnv: string;
  timeoutMs: number;
  maxRetries: number;
  concurrency: number;
};

/** Default base URL known for groq; Anthropic's is fixed; Nebius's must be set by the operator. */
const DEFAULT_BASE_URL: Partial<Record<ProviderId, string>> = {
  groq: "https://api.groq.com/openai/v1",
};

/**
 * Base URL precedence: LLM_BASE_URL_{ID} env → known default. Anthropic's
 * transport always targets https://api.anthropic.com (its baseUrl input is
 * ignored — tests hit the same default).
 */
export function providerConfig(id: ProviderId): ProviderConfig {
  const envBase = getOptionalEnv(`LLM_BASE_URL_${id.toUpperCase()}`, null);
  const baseUrl =
    id === "anthropic" ? "https://api.anthropic.com" : envBase ?? DEFAULT_BASE_URL[id] ?? "";
  const cfg: ProviderConfig = {
    id,
    baseUrl,
    apiKeyEnv: `LLM_API_KEY_${id.toUpperCase()}`,
    modelEnv: `${id.toUpperCase()}_MODEL`,
    timeoutMs: getOptionalNumberEnv(`LLM_TIMEOUT_${id.toUpperCase()}`, id === "groq" ? 30_000 : 60_000),
    maxRetries: getOptionalNumberEnv(`LLM_MAX_RETRIES_${id.toUpperCase()}`, 3),
    concurrency: getOptionalNumberEnv(`LLM_CONCURRENCY_${id.toUpperCase()}`, 1),
  };
  if (!baseUrl) throw new LlmUnconfiguredError(id, [`LLM_BASE_URL_${id.toUpperCase()}`]);
  return cfg;
}

/** All providers the gateway knows (exported for the eval script's loop). */
export const ALL_PROVIDERS: ProviderId[] = ["groq", "nebius", "anthropic"];

/** The env-configured default provider, or null when unset/unknown. */
export function defaultProvider(): ProviderId | null {
  const name = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (name === "groq" || name === "nebius" || name === "anthropic") return name;
  return null;
}

export function providerApiKey(cfg: ProviderConfig): string | null {
  return process.env[cfg.apiKeyEnv] || null;
}

/** True when calls to `id` can actually be made (base URL + key + model configured). */
export function providerReady(id: ProviderId): boolean {
  try {
    const cfg = providerConfig(id);
    return Boolean(providerApiKey(cfg) && getOptionalEnv(cfg.modelEnv, null));
  } catch {
    return false; // unconfigured (e.g. Nebius base URL unset) is a readiness answer, not a crash
  }
}

// ---------------------------------------------------------------------------
// Privacy gate
// ---------------------------------------------------------------------------

/**
 * Free-tier Groq may only see public-repo source. Bumped explicitly with
 * ALLOW_PRIVATE_ON_GROQ=true (the operator accepts the ToS risk); anything
 * else keeps private repos away from groq — fail closed, never open.
 */
export function groqPrivateAllowed(): boolean {
  return getOptionalBooleanEnv("ALLOW_PRIVATE_ON_GROQ", false);
}

export function assertPrivacyOk(id: ProviderId, repoPublic: boolean): void | never {
  if (repoPublic || id !== "groq" || groqPrivateAllowed()) return;
  throw new LlmPrivacyError(
    id,
    'The "groq" provider is only allowed for public repos (free-tier terms) — private repos ' +
      "need the anthropic or nebius provider, or set ALLOW_PRIVATE_ON_GROQ=true explicitly.",
  );
}

// ---------------------------------------------------------------------------
// Per-provider concurrency cap
// ---------------------------------------------------------------------------

const CAPS = new Map<string, Semaphore>();

function capFor(id: ProviderId, limit: number): Semaphore {
  const key = `${id}:${limit}`;
  let c = CAPS.get(key);
  if (!c) {
    c = new Semaphore(limit);
    CAPS.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Failure memory (health surfaces provider + last failure; never keys)
// ---------------------------------------------------------------------------

const FAILURE_KEEP_MS = 60 * 60 * 1000; // report failures for at most an hour
let lastFailure: { provider: string; at: number; message: string } | null = null;

/** The most recent gateway failure (provider, ISO time, message ≤200 chars). */
export function lastLlmFailure(): { provider: string; at: string; message: string } | null {
  if (!lastFailure) return null;
  if (Date.now() - lastFailure.at > FAILURE_KEEP_MS) return null;
  return {
    provider: lastFailure.provider,
    at: new Date(lastFailure.at).toISOString(),
    message: lastFailure.message,
  };
}

function recordFailure(provider: string, message: string): void {
  lastFailure = { provider, at: Date.now(), message: message.slice(0, 200) };
}

// ---------------------------------------------------------------------------
// The one function callers use
// ---------------------------------------------------------------------------

export async function generateText(req: LlmRequest): Promise<LlmResult> {
  const provider = req.provider ?? defaultProvider();
  if (!provider) throw new LlmError(null, "no LLM provider selected — set LLM_PROVIDER");
  const cfg = providerConfig(provider); // throws LlmUnconfiguredError when base URL unknown (nebius unset)
  // Privacy gate FIRST — a groq + private-repo request fails on privacy
  // even when the key/minimum config is also missing (fail closed, and
  // never let a config error mask the privacy refusal).
  assertPrivacyOk(provider, req.repoPublic);
  const apiKey = providerApiKey(cfg);
  if (!apiKey) throw new LlmUnconfiguredError(provider, [cfg.apiKeyEnv]);

  const model = getOptionalEnv(cfg.modelEnv, null);
  if (!model) throw new LlmUnconfiguredError(provider, [cfg.modelEnv]);

  const sem = capFor(provider, cfg.concurrency);
  const started = Date.now();
  const common = {
    apiKey,
    model,
    system: req.system,
    prompt: req.prompt,
    maxTokens: req.maxTokens,
    temperature: req.temperature,
    timeoutMs: cfg.timeoutMs,
    maxRetries: cfg.maxRetries,
  };

  let out;
  try {
    out = await sem.withPermit(() =>
      provider === "anthropic"
        ? callAnthropic({ ...common, baseUrl: cfg.baseUrl })
        : callOpenAiCompatible({ ...common, baseUrl: cfg.baseUrl }),
    );
  } catch (err) {
    recordFailure(provider, err instanceof Error ? err.message : String(err));
    throw err;
  }

  return {
    text: out.text,
    provider,
    model,
    tokensIn: out.tokensIn,
    tokensOut: out.tokensOut,
    latencyMs: Date.now() - started,
  };
}
