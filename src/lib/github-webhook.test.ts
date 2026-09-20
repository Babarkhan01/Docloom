import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { debounceSeconds, triagePush, verifyGitHubSignature, type PushEvent, type RepoGateState } from "./github-webhook";

const SECRET = "test-webhook-secret";
const BODY = JSON.stringify({ ref: "refs/heads/main", after: "abc123", repository: { full_name: "o/r" }, installation: { id: 1 } });

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", Buffer.from(secret, "utf8")).update(body, "utf8").digest("hex")}`;
}

describe("verifyGitHubSignature", () => {
  it("accepts a valid signature over the raw body", () => {
    expect(
      verifyGitHubSignature({ rawBody: BODY, signatureHeader: sign(BODY), secret: SECRET }),
    ).toBe(true);
  });

  it("rejects a signature computed over different bytes (tampered body)", () => {
    const tampered = BODY.replace("abc123", "zzz999");
    expect(
      verifyGitHubSignature({ rawBody: tampered, signatureHeader: sign(BODY), secret: SECRET }),
    ).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyGitHubSignature({ rawBody: BODY, signatureHeader: null, secret: SECRET })).toBe(false);
    expect(verifyGitHubSignature({ rawBody: BODY, signatureHeader: "sha256=deadbeef", secret: SECRET })).toBe(false);
    expect(verifyGitHubSignature({ rawBody: BODY, signatureHeader: sign(BODY).replace("sha256=", ""), secret: SECRET })).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    expect(
      verifyGitHubSignature({ rawBody: BODY, signatureHeader: sign(BODY, "other-secret"), secret: SECRET }),
    ).toBe(false);
  });

  it("fail-closed without a secret in production, even for marked test events", () => {
    expect(
      verifyGitHubSignature({ rawBody: BODY, signatureHeader: null, secret: undefined, testMarker: "1", isProduction: true }),
    ).toBe(false);
  });

  it("dev escape hatch: unsigned delivery accepted only with the test marker and no secret", () => {
    expect(
      verifyGitHubSignature({ rawBody: BODY, signatureHeader: null, secret: undefined, testMarker: "1", isProduction: false }),
    ).toBe(true);
    expect(
      verifyGitHubSignature({ rawBody: BODY, signatureHeader: null, secret: undefined, testMarker: null, isProduction: false }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------

const basePush: PushEvent = {
  event: "push",
  repoFullName: "o/r",
  installationId: 42,
  ref: "refs/heads/main",
  after: "cafe123",
};

const baseGates: RepoGateState = {
  connected: true,
  defaultBranch: "main",
  plan: "starter",
  autoRegenerate: true,
  lastProcessedCommitSha: null,
  lastWebhookAt: null,
  quotaUsed: 0,
  quotaLimit: 25,
};

const NOW = new Date("2026-09-20T12:00:00Z");

describe("triagePush", () => {
  it("ignores non-push events", () => {
    expect(triagePush({ ...basePush, event: "ping" }, baseGates, NOW)).toEqual({
      action: "ignore",
      reason: "not_a_push_event",
    });
  });

  it("ignores pushes to a non-default branch", () => {
    expect(triagePush({ ...basePush, ref: "refs/heads/feature-x" }, baseGates, NOW)).toEqual({
      action: "ignore",
      reason: "not_default_branch",
    });
  });

  it("ignores malformed payloads and branch deletions (zero SHA)", () => {
    expect(triagePush({ ...basePush, after: null }, baseGates, NOW).action).toBe("ignore");
    expect(triagePush({ ...basePush, after: "0000000000000000000000000000000000000000" }, baseGates, NOW).action).toBe("ignore");
    expect(triagePush({ ...basePush, ref: null }, baseGates, NOW).action).toBe("ignore");
  });

  it("ignores repos that are not connected", () => {
    expect(triagePush(basePush, { ...baseGates, connected: false }, NOW)).toEqual({
      action: "ignore",
      reason: "repo_not_connected",
    });
  });

  it("ignores free-plan owners", () => {
    expect(triagePush(basePush, { ...baseGates, plan: "free" }, NOW)).toEqual({
      action: "ignore",
      reason: "plan_not_paid",
    });
  });

  it("ignores repos whose per-repo toggle is off", () => {
    expect(triagePush(basePush, { ...baseGates, autoRegenerate: false }, NOW)).toEqual({
      action: "ignore",
      reason: "toggle_off",
    });
  });

  it("dedupes a re-delivery with an already-processed head SHA", () => {
    expect(
      triagePush(basePush, { ...baseGates, lastProcessedCommitSha: "cafe123" }, NOW),
    ).toEqual({ action: "dedupe", reason: "same_head_sha_already_processed" });
  });

  it("debounces pushes arriving inside the window", () => {
    const lastWebhookAt = new Date(NOW.getTime() - 30 * 1000); // 30s ago, 60s window
    expect(triagePush(basePush, { ...baseGates, lastWebhookAt }, NOW)).toEqual({
      action: "debounce",
      reason: "within_debounce_window",
    });
  });

  it("queues again once the debounce window has passed", () => {
    const lastWebhookAt = new Date(NOW.getTime() - 61 * 1000);
    expect(triagePush(basePush, { ...baseGates, lastWebhookAt }, NOW)).toEqual({ action: "queue" });
  });

  it("checks quota after dedupe/debounce and records exhaustion", () => {
    expect(triagePush(basePush, { ...baseGates, quotaUsed: 25, quotaLimit: 25 }, NOW)).toEqual({
      action: "quota_exhausted",
      reason: "daily_quota_exhausted",
      message: expect.stringContaining("daily generation limit reached (25/25)"),
    });
    // A debounced push stays debounced even when quota is exhausted (no new spend).
    const lastWebhookAt = new Date(NOW.getTime() - 5 * 1000);
    expect(
      triagePush(basePush, { ...baseGates, lastWebhookAt, quotaUsed: 25, quotaLimit: 25 }, NOW).action,
    ).toBe("debounce");
  });

  it("queues a valid push from a paid, toggled-on repo with quota left", () => {
    expect(triagePush(basePush, baseGates, NOW)).toEqual({ action: "queue" });
  });

  it("honors a zero debounce window (every push queues)", () => {
    const lastWebhookAt = new Date(NOW.getTime() - 500);
    expect(triagePush(basePush, { ...baseGates, lastWebhookAt }, NOW, 0)).toEqual({ action: "queue" });
  });

  it("debounce default is 60s and overridable via env", () => {
    expect(debounceSeconds()).toBe(60);
    const prev = process.env.DOCLOOM_WEBHOOK_DEBOUNCE_SECONDS;
    process.env.DOCLOOM_WEBHOOK_DEBOUNCE_SECONDS = "120";
    expect(debounceSeconds()).toBe(120);
    process.env.DOCLOOM_WEBHOOK_DEBOUNCE_SECONDS = "garbage";
    expect(debounceSeconds()).toBe(60);
    if (prev === undefined) delete process.env.DOCLOOM_WEBHOOK_DEBOUNCE_SECONDS;
    else process.env.DOCLOOM_WEBHOOK_DEBOUNCE_SECONDS = prev;
  });
});
