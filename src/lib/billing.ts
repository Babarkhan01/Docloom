/**
 * Plan + billing logic for quotas (PRD §pricing: Free 5/day, Starter $19 25/day,
 * Team $49 100/day). Kept dependency-free (no imports) so the effective-plan
 * rules can be unit-tested directly and stay the single authoritative seam.
 *
 * Entitlement rule: a paid plan is only effective while the Dodo subscription
 * status says so. `on_hold` (renewal payment failed) keeps paid access for a
 * 7-day grace window; cancelled / expired / failed (terminal) drop to free.
 */

export type Plan = "free" | "starter" | "team";

export const GRACE_PERIOD_DAYS = 7;

/** Daily generation caps per plan (spec §4 — limits before any LLM spend). */
export function dailyGenerationLimitFor(plan: Plan): number {
  if (plan === "starter") return Number(process.env.DOCLOOM_DAILY_LIMIT_STARTER ?? 25);
  if (plan === "team") return Number(process.env.DOCLOOM_DAILY_LIMIT_TEAM ?? 100);
  return Number(process.env.DOCLOOM_DAILY_GENERATION_LIMIT ?? 5);
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
