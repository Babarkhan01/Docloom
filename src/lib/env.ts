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

export function appUrl(): string {
  return getOptionalEnv("APP_URL", "http://localhost:3000");
}

export function rateLimitConfig() {
  return {
    max: Number(process.env.RATE_LIMIT_MAX ?? 30),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  };
}
