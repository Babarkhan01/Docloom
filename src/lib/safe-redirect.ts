/**
 * Open-redirect guard for `?next=` after sign-in (P1.6: playground → signup →
 * connect-the-repo-you-just-generated).
 *
 * Only same-origin, path-only targets are allowed. Absolute URLs,
 * protocol-relative (`//evil.com`), backslash variants, control characters, and
 * anything that decodes to those are rejected. This module is deliberately
 * dependency-free so the edge proxy can import it.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 300) return null;

  // Must be a root-relative path, not a full URL or a protocol-relative one.
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  // Backslashes are treated as slashes by some browsers — refuse them outright.
  if (value.includes("\\")) return null;
  // No control characters (header/redirect splitting hygiene).
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;

  // Re-check after decoding: `/%2F%2Fevil.com` and friends.
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  if (decoded.startsWith("//") || decoded.includes("\\")) return null;

  // Never bounce back into the auth pages (redirect loop). Compare the path
  // portion only, so `/login?next=/dashboard` is caught too.
  const pathOnly = decoded.split(/[?#]/, 1)[0].toLowerCase();
  if (pathOnly === "/login" || pathOnly.startsWith("/api/auth")) return null;

  return value;
}
