/**
 * Environment variable access. All secrets live in environment variables
 * (per project principle); accessing a missing required var fails loudly.
 * Reads are lazy so pages that don't need a var can render without it.
 *
 * Keep this module free of node built-in imports: it sits in the proxy's
 * (edge runtime) import chain via session-core. Node-only env needs live in
 * github-key.ts; the optional .env.local.secrets loader lives in env-file.ts.
 */

export function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export function getOptionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

/**
 * Public base URL used for OAuth callback URIs and metadata.
 * Local dev may omit APP_URL (defaults to localhost:3000). Production must
 * set it — fail loudly instead of silently emitting localhost URLs into
 * redirects, sitemaps, and OAuth callbacks. Exempted during the build phase
 * (prerendering) so `next build` works without deployment config.
 */
export function appUrl(): string {
  const devFallback = "http://localhost:3000";
  const value = getOptionalEnv("APP_URL", devFallback);
  const missingOrDefault = !process.env.APP_URL || process.env.APP_URL === devFallback;
  const isProdRuntime =
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PHASE !== "phase-production-build";
  if (isProdRuntime && missingOrDefault && process.env.DOCLOOM_ALLOW_LOCALHOST_URL !== "1") {
    throw new Error(
      "APP_URL is required in production — set it to the public base URL (e.g. https://docloom.app). " +
        "Set DOCLOOM_ALLOW_LOCALHOST_URL=1 only when intentionally running production mode on localhost.",
    );
  }
  return value;
}

export function rateLimitConfig() {
  return {
    max: Number(process.env.RATE_LIMIT_MAX ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  };
}
