/**
 * Extra environment readers used by the LLM gateway. Pure process.env
 * access — no node built-ins, safe in edge import chains (unlike env.ts's
 * appUrl() and env-file.ts's fs loader, which stay out of this path).
 */

/** Optional string env: unset/empty → fallback (null = "unset"). */
export function getOptionalEnv(key: string, fallback: string | null): string | null {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  return fallback;
}

/** Optional numeric env: invalid/negative → fallback. Accepts 0 for retry counts. */
export function getOptionalNumberEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Optional boolean env: accepts 1/true/yes/on and 0/false/no/off (case-insensitive). */
export function getOptionalBooleanEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}
