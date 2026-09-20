import { createHmac, timingSafeEqual } from "node:crypto";
import type { Plan } from "./billing";

/**
 * GitHub webhook verification + push triage, kept pure (no DB, no fetch) so
 * every gate is unit-testable. The route handler in
 * app/api/webhooks/github/route.ts supplies state; this module only decides.
 *
 * Signature: GitHub signs the RAW request body with HMAC-SHA-256 (hex) using
 * the App webhook secret and sends it as `x-hub-signature-256: sha256=<hex>`.
 * Verification is a constant-time comparison over the raw bytes — never over
 * a re-serialized parse.
 */

/** Constant-time string equality (length-guarded; equal length is public). */
function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verify a GitHub webhook delivery. Returns false on a missing header,
 * a malformed one, or any signature mismatch — the caller must 401.
 *
 * Dev escape hatch mirrors the Dodo endpoint: with no secret configured
 * (endpoint not yet registered), an explicitly-marked local test delivery is
 * accepted ONLY outside production. With the secret set, unsigned deliveries
 * are always rejected.
 */
export function verifyGitHubSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string | undefined;
  /** Value of the local test marker header (only honored in dev, secret unset). */
  testMarker?: string | null;
  isProduction?: boolean;
}): boolean {
  const { rawBody, signatureHeader, secret } = opts;
  const isProduction = opts.isProduction ?? process.env.NODE_ENV === "production";

  if (!secret) {
    return !isProduction && opts.testMarker === "1";
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", Buffer.from(secret, "utf8")).update(rawBody, "utf8").digest("hex");
  return safeEqual(Buffer.from(signatureHeader.slice("sha256=".length)), Buffer.from(expected));
}

// ---------------------------------------------------------------------------
// Push triage — every gate from the Phase 2 spec, in decision order
// ---------------------------------------------------------------------------

export type PushEvent = {
  /** x-github-event header value. */
  event: string;
  /** payload.repository.full_name */
  repoFullName: string | null;
  /** payload.installation.id */
  installationId: number | null;
  /** payload.ref, e.g. "refs/heads/main" */
  ref: string | null;
  /** payload.after — head commit SHA ("000...0" on branch deletion). */
  after: string | null;
};

export type RepoGateState = {
  /** The repo is connected in Docloom (row exists for this installation). */
  connected: boolean;
  defaultBranch: string | null;
  plan: Plan;
  /** Per-repo auto-regenerate toggle (default OFF). */
  autoRegenerate: boolean;
  lastProcessedCommitSha: string | null;
  lastWebhookAt: Date | null;
  quotaUsed: number;
  quotaLimit: number;
};

export type TriageDecision =
  | { action: "ignore"; reason: string }
  | { action: "dedupe"; reason: string }
  | { action: "debounce"; reason: string }
  | { action: "quota_exhausted"; reason: string; message: string }
  | { action: "queue" };

export const DEBOUNCE_SECONDS_DEFAULT = 60;

export function debounceSeconds(): number {
  const n = Number(process.env.DOCLOOM_WEBHOOK_DEBOUNCE_SECONDS ?? DEBOUNCE_SECONDS_DEFAULT);
  return Number.isFinite(n) && n >= 0 ? n : DEBOUNCE_SECONDS_DEFAULT;
}

/** Branch deletion / force-push resets deliver an all-zero "after" SHA. */
function isZeroSha(sha: string | null): boolean {
  return !!sha && /^0+$/.test(sha);
}

/**
 * Decide what a valid push delivery means for one connected repo.
 * Order matters: cheap structural ignores first, then entitlements, then
 * dedupe/debounce, then quota — "queue" only when every gate passes.
 */
export function triagePush(push: PushEvent, repo: RepoGateState, now: Date, debounceSec = debounceSeconds()): TriageDecision {
  if (push.event !== "push") return { action: "ignore", reason: "not_a_push_event" };
  if (!push.repoFullName || !push.ref || !push.after || isZeroSha(push.after)) {
    return { action: "ignore", reason: "malformed_push_payload" };
  }
  if (repo.defaultBranch && push.ref !== `refs/heads/${repo.defaultBranch}`) {
    return { action: "ignore", reason: "not_default_branch" };
  }
  if (!repo.connected) return { action: "ignore", reason: "repo_not_connected" };
  if (repo.plan === "free") return { action: "ignore", reason: "plan_not_paid" };
  if (!repo.autoRegenerate) return { action: "ignore", reason: "toggle_off" };

  // Duplicate delivery (GitHub retries, replay): identical head SHA.
  if (repo.lastProcessedCommitSha && repo.lastProcessedCommitSha === push.after) {
    return { action: "dedupe", reason: "same_head_sha_already_processed" };
  }

  // Debounce: a run is already pending or just started — fold this push into
  // it (the run reads the repo HEAD at execution time) instead of queueing
  // another. The route updates the repo's SHA so the pending run sees it.
  if (repo.lastWebhookAt && now.getTime() - repo.lastWebhookAt.getTime() < debounceSec * 1000) {
    return { action: "debounce", reason: "within_debounce_window" };
  }

  if (repo.quotaUsed >= repo.quotaLimit) {
    return {
      action: "quota_exhausted",
      reason: "daily_quota_exhausted",
      message: `Auto-regenerate skipped: daily generation limit reached (${repo.quotaUsed}/${repo.quotaLimit}). The next push after the daily reset will regenerate docs.`,
    };
  }

  return { action: "queue" };
}
