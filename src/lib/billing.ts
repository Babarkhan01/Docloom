/**
 * Plan + billing logic for quotas and entitlements (PRD §pricing: Free 5/day,
 * Starter $19 25/day, Team $49 100/day). Kept dependency-free (no imports) so
 * the effective-plan rules can be unit-tested directly and stay the single
 * authoritative seam.
 *
 * Entitlement rule: a paid plan is only effective while the Dodo subscription
 * status says so. `on_hold` (renewal payment failed) keeps paid access for a
 * 7-day grace window; cancelled / expired / failed (terminal) drop to free.
 *
 * Tier split (value gating, not just daily quotas):
 * - Free:  1 repo, public only, manual regenerate, "Built with Docloom" branding.
 * - Starter: 5 repos, private repos, auto-regenerate on merge, no branding, 25/day.
 * - Team:  20 repos, everything in Starter, 100/day.
 */

export type Plan = "free" | "starter" | "team";

export const GRACE_PERIOD_DAYS = 7;

/** Daily generation caps per plan (spec §4 — limits before any LLM spend). */
export function dailyGenerationLimitFor(plan: Plan): number {
  if (plan === "starter") return Number(process.env.DOCLOOM_DAILY_LIMIT_STARTER ?? 25);
  if (plan === "team") return Number(process.env.DOCLOOM_DAILY_LIMIT_TEAM ?? 100);
  return Number(process.env.DOCLOOM_DAILY_GENERATION_LIMIT ?? 5);
}

/** Max simultaneously connected repos per plan. */
export function maxReposFor(plan: Plan): number {
  if (plan === "starter") return Number(process.env.DOCLOOM_MAX_REPOS_STARTER ?? 5);
  if (plan === "team") return Number(process.env.DOCLOOM_MAX_REPOS_TEAM ?? 20);
  return Number(process.env.DOCLOOM_MAX_REPOS_FREE ?? 1);
}

/** Private repos are a paid feature (Starter and up). */
export function allowsPrivateRepos(plan: Plan): boolean {
  return plan === "starter" || plan === "team";
}

/** Auto-regenerate on merge is a paid feature (Phase 2 enforcement). */
export function allowsAutoRegenerate(plan: Plan): boolean {
  return plan === "starter" || plan === "team";
}

/** Free-tier published docs carry "Built with Docloom" branding; paid removes it. */
export function brandingRequired(plan: Plan): boolean {
  return plan === "free";
}

/** The minimal user fields the plan logic needs (drizzle rows satisfy this). */
export type BillingUser = {
  plan: string | null;
  dodoSubscriptionStatus: string | null;
  dodoGraceUntil: Date | null;
};

/** Plan whose limits currently apply, given subscription state. */
export function effectivePlan(user: BillingUser): Plan {
  const plan = user.plan === "starter" || user.plan === "team" ? user.plan : "free";
  if (plan === "free") return "free";

  // Paid plan in the DB is only honored with a live subscription behind it.
  const status = user.dodoSubscriptionStatus;
  if (status === "active") return plan;

  if (status === "on_hold") {
    // Grace window: paid limits continue until dodo_grace_until passes.
    if (user.dodoGraceUntil && user.dodoGraceUntil.getTime() > Date.now()) return plan;
    return "free";
  }

  // null (never subscribed), cancelled, expired, failed → free.
  return "free";
}

/** Daily cap for a user row — the function quota checks call. */
export function dailyGenerationLimit(user: BillingUser): number {
  return dailyGenerationLimitFor(effectivePlan(user));
}

// ---------------------------------------------------------------------------
// Connect eligibility — the single pure gate for adding a repo. Server routes
// call this after counting the user's connected repos; the UI mirrors it for
// preview only (the API is authoritative).
// ---------------------------------------------------------------------------

export type ConnectEligibilityInput = {
  plan: Plan;
  /** Repos the user has already connected (all statuses count — each holds a docs subdomain). */
  connectedCount: number;
  isPrivate: boolean;
};

export type ConnectEligibility =
  | { ok: true }
  | {
      ok: false;
      reason: "repo_limit" | "private_repos";
      error: string;
      status: number;
      /** Plan that unlocks the gated capability; null when already on the top tier. */
      upgradeTo: "starter" | "team" | null;
      message: string;
    };

/**
 * Whether the user may connect one more repo. Grandfathering policy: repos
 * connected before the tier split keep working regardless of plan — only NEW
 * connects are gated. That falls out naturally from counting existing repos:
 * a legacy free user over the limit simply can't add more until they're under it.
 */
export function checkConnectEligibility(input: ConnectEligibilityInput): ConnectEligibility {
  const { plan, connectedCount, isPrivate } = input;
  const maxRepos = maxReposFor(plan);

  if (connectedCount >= maxRepos) {
    if (plan === "team") {
      return {
        ok: false,
        reason: "repo_limit",
        error: "repo_limit_reached",
        status: 403,
        upgradeTo: null,
        message: `You've connected ${connectedCount} of ${maxRepos} repos on Team — the top tier. Disconnect a repo to add another.`,
      };
    }
    const upgrade = plan === "free" ? "starter" : "team";
    const nextMax = maxReposFor(upgrade);
    const extras =
      plan === "free"
        ? " — including private repos — plus auto-regenerate on merge and no Docloom branding"
        : "";
    return {
      ok: false,
      reason: "repo_limit",
      error: "repo_limit_reached",
      status: 403,
      upgradeTo: upgrade,
      message: `You've connected ${connectedCount} of ${maxRepos} repos on the Free plan. Upgrade to ${upgrade === "starter" ? "Starter" : "Team"} to connect up to ${nextMax} repos${extras}.`,
    };
  }

  if (isPrivate && !allowsPrivateRepos(plan)) {
    return {
      ok: false,
      reason: "private_repos",
      error: "private_repos_upgrade",
      status: 403,
      upgradeTo: "starter",
      message:
        "Private repos are a Starter feature. Upgrade to Starter ($19/mo) to document private repos with read-only access, auto-regenerate docs on every merge, and remove Docloom branding.",
    };
  }

  return { ok: true };
}
