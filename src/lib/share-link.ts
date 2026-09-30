import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, non-guessable links for the shareable diff view (P2.8).
 *
 * A share link exposes a repo's draft markdown (the diff against what is
 * currently published), so the URL itself is the credential: a token is an
 * HMAC-SHA-256 over a namespaced payload, keyed by a server secret. There is
 * no expiry column and no schema change — the link stays valid until the
 * secret rotates, which is what a "send this to my teammate" link wants.
 *
 * Kept dependency-free apart from node:crypto so it works identically in the
 * Node runtime and under Cloudflare's node compat layer.
 */

const NAMESPACE = "diff";

function shareSecret(): string {
  const secret = process.env.SHARE_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SHARE_TOKEN_SECRET (or SESSION_SECRET) is required to sign or verify share links.",
    );
  }
  return secret;
}

function hmac(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

/** Build the share token for a generation id. */
export function signDiffShareToken(generationId: string): string {
  const payload = `${NAMESPACE}.${generationId}`;
  const body = Buffer.from(payload, "utf8").toString("base64url");
  return `${body}.${hmac(payload, shareSecret())}`;
}

/**
 * Verify a share token and return the generation id it authorizes, or null
 * when the token is malformed or the signature does not match. Never throws —
 * a bad link 404s, it does not 500.
 */
export function verifyDiffShareToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let payload: string;
  try {
    payload = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const parts = payload.split(".");
  if (parts.length !== 2 || parts[0] !== NAMESPACE) return null;
  const generationId = parts[1];
  // UUID shape — rejects a tampered payload before it reaches the database.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(generationId)) {
    return null;
  }

  let expected: string;
  try {
    expected = hmac(payload, shareSecret());
  } catch {
    return null;
  }

  const received = Buffer.from(mac, "utf8");
  const want = Buffer.from(expected, "utf8");
  if (received.length !== want.length || !timingSafeEqual(received, want)) return null;

  return generationId;
}
