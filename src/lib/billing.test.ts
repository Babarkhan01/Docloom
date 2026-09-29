import { afterEach, describe, expect, it } from "vitest";
import {
  allowsAutoRegenerate,
  allowsPrivateRepos,
  allowsScheduledRegenerate,
  allowsCustomSubdomain,
  brandingRequired,
  checkConnectEligibility,
  checkoutPrice,
  dailyGenerationLimitFor,
  effectivePlan,
  historyRetentionFor,
  isOverDailyGenLimit,
  isOverRepoLimit,
  maxReposFor,
  maxSeatsFor,
  planLabel,
  seatPriceCents,
  shouldPauseAutoRegen,
  softLimitFlag,
  type BillingUser,
  type Plan,
} from "./billing";

/** Save/restore the DOCLOOM_* env vars each limit test touches. */
const ENV_KEYS = [
  "DOCLOOM_DAILY_GENERATION_LIMIT",
  "DOCLOOM_DAILY_LIMIT_PRO",
  "DOCLOOM_DAILY_LIMIT_TEAM",
  "DOCLOOM_MAX_REPOS_FREE",
  "DOCLOOM_MAX_REPOS_PRO",
  "DOCLOOM_MAX_REPOS_TEAM",
  "DOCLOOM_ANNUAL_MULT",
] as const;
const savedEnv: Record<string, string | undefined> = {};
afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
function withEnv(set: Record<string, string>, fn: () => void): void {
  for (const key of ENV_KEYS) savedEnv[key] ??= process.env[key];
  for (const [key, value] of Object.entries(set)) process.env[key] = value;
  fn();
}

function user(partial: Partial<BillingUser>): BillingUser {
  return {
    plan: null,
    dodoSubscriptionStatus: null,
    dodoGraceUntil: null,
    ...partial,
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe("effectivePlan — highest active tier wins", () => {
  it("returns free for anything that is not pro/team", () => {
    expect(effectivePlan(user({ plan: null }))).toBe("free");
    expect(effectivePlan(user({ plan: "free" }))).toBe("free");
    expect(effectivePlan(user({ plan: "pro" }))).toBe("free");
  });

  it("honors a paid plan only with a live subscription", () => {
    expect(
      effectivePlan(user({ plan: "pro", dodoSubscriptionStatus: "active" })),
    ).toBe("pro");
    expect(
      effectivePlan(user({ plan: "team", dodoSubscriptionStatus: "active" })),
    ).toBe("team");
  });

  it("drops to free for null and terminal subscription statuses", () => {
    for (const status of [null, "cancelled", "expired", "failed"]) {
      expect(
        effectivePlan(user({ plan: "pro", dodoSubscriptionStatus: status })),
      ).toBe("free");
    }
  });

  it("keeps paid access during the on_hold grace window", () => {
    const withinGrace = user({
      plan: "team",
      dodoSubscriptionStatus: "on_hold",
      dodoGraceUntil: new Date(Date.now() + DAY),
    });
    expect(effectivePlan(withinGrace)).toBe("team");
  });

  it("drops to free once the grace window expires (or is missing)", () => {
    const expiredGrace = user({
      plan: "pro",
      dodoSubscriptionStatus: "on_hold",
      dodoGraceUntil: new Date(Date.now() - 1000),
    });
    expect(effectivePlan(expiredGrace)).toBe("free");

    const noGrace = user({
      plan: "pro",
      dodoSubscriptionStatus: "on_hold",
      dodoGraceUntil: null,
    });
    expect(effectivePlan(noGrace)).toBe("free");
  });

  it("treats an unknown plan string as free", () => {
    expect(effectivePlan(user({ plan: "starter" }))).toBe("free");
  });
});

describe("dailyGenerationLimitFor", () => {
  it("defaults to Free 5 / Pro 25 / Team 100 per day", () => {
    withEnv({}, () => {
      expect(dailyGenerationLimitFor("free")).toBe(5);
      expect(dailyGenerationLimitFor("pro")).toBe(25);
      expect(dailyGenerationLimitFor("team")).toBe(100);
    });
  });

  it("honors env overrides", () => {
    withEnv({ DOCLOOM_DAILY_LIMIT_PRO: "40" }, () => {
      expect(dailyGenerationLimitFor("pro")).toBe(40);
    });
  });
});

describe("maxReposFor", () => {
  it("defaults to Free 1 / Pro 5 / Team 20", () => {
    withEnv({}, () => {
      expect(maxReposFor("free")).toBe(1);
      expect(maxReposFor("pro")).toBe(5);
      expect(maxReposFor("team")).toBe(20);
    });
  });

  it("honors env overrides", () => {
    withEnv({ DOCLOOM_MAX_REPOS_TEAM: "50" }, () => {
      expect(maxReposFor("team")).toBe(50);
    });
  });
});

describe("feature entitlements per plan", () => {
  it("private repos: paid only", () => {
    expect(allowsPrivateRepos("free")).toBe(false);
    expect(allowsPrivateRepos("pro")).toBe(true);
    expect(allowsPrivateRepos("team")).toBe(true);
  });

  it("auto-regenerate: paid only", () => {
    expect(allowsAutoRegenerate("free")).toBe(false);
    expect(allowsAutoRegenerate("pro")).toBe(true);
    expect(allowsAutoRegenerate("team")).toBe(true);
  });

  it("scheduled regeneration: pro and team", () => {
    expect(allowsScheduledRegenerate("free")).toBe(false);
    expect(allowsScheduledRegenerate("pro")).toBe(true);
    expect(allowsScheduledRegenerate("team")).toBe(true);
  });

  it("custom subdomain: paid only", () => {
    expect(allowsCustomSubdomain("free")).toBe(false);
    expect(allowsCustomSubdomain("pro")).toBe(true);
    expect(allowsCustomSubdomain("team")).toBe(true);
  });

  it("seats: free and pro = 1, team = 5", () => {
    expect(maxSeatsFor("free")).toBe(1);
    expect(maxSeatsFor("pro")).toBe(1);
    expect(maxSeatsFor("team")).toBe(5);
  });

  it("seat price: only team charges per seat beyond the included 5", () => {
    expect(seatPriceCents("free")).toBe(0);
    expect(seatPriceCents("pro")).toBe(0);
    expect(seatPriceCents("team")).toBe(1000);
  });

  it("history retention: free keeps last 3, paid keeps everything", () => {
    expect(historyRetentionFor("free")).toBe(3);
    expect(historyRetentionFor("pro")).toBe(Infinity);
    expect(historyRetentionFor("team")).toBe(Infinity);
  });

  it("branding: free only", () => {
    expect(brandingRequired("free")).toBe(true);
    expect(brandingRequired("pro")).toBe(false);
    expect(brandingRequired("team")).toBe(false);
  });
});

describe("planLabel", () => {
  it("renders Free for the free tier", () => {
    expect(planLabel("free")).toBe("Free");
  });

  it("renders monthly price for paid tiers", () => {
    expect(planLabel("pro", false)).toBe("Pro — $29/mo");
    expect(planLabel("team", false)).toBe("Team — $89/mo");
  });

  it("renders annual price at 10x monthly", () => {
    withEnv({ DOCLOOM_ANNUAL_MULT: "10" }, () => {
      expect(planLabel("pro", true)).toBe("Pro — $290/yr");
      expect(planLabel("team", true)).toBe("Team — $890/yr");
    });
  });

  it("uses the env annual multiplier", () => {
    withEnv({ DOCLOOM_ANNUAL_MULT: "12" }, () => {
      expect(planLabel("pro", true)).toBe("Pro — $348/yr");
    });
  });
});

describe("checkoutPrice — grandfathering at renewal", () => {
  it("returns null cents for the free plan", () => {
    expect(checkoutPrice({ grandfatheredPriceCents: null }, "free")).toEqual({
      cents: null,
      plan: "free",
    });
  });

  it("returns the listed monthly price when no grandfathered price is set", () => {
    expect(checkoutPrice({ grandfatheredPriceCents: null }, "pro")).toEqual({
      cents: 2900,
      plan: "pro",
    });
    expect(checkoutPrice({ grandfatheredPriceCents: null }, "team")).toEqual({
      cents: 8900,
      plan: "team",
    });
  });

  it("uses the grandfathered price when set", () => {
    expect(
      checkoutPrice({ grandfatheredPriceCents: 1900 }, "pro"),
    ).toEqual({ cents: 1900, plan: "pro" });
    expect(
      checkoutPrice({ grandfatheredPriceCents: 4900 }, "team"),
    ).toEqual({ cents: 4900, plan: "team" });
  });

  it("uses annual price at 10x when grandfathered price is not set", () => {
    expect(checkoutPrice({ grandfatheredPriceCents: null }, "pro", true)).toEqual({
      cents: 29000,
      plan: "pro",
    });
  });

  it("still uses the grandfathered price on annual renewal when set", () => {
    // Grandfathering in this model is a per-customer cents override, applied
    // at renewal checkout regardless of billing period.
    expect(
      checkoutPrice({ grandfatheredPriceCents: 1900 }, "pro", true),
    ).toEqual({ cents: 1900, plan: "pro" });
  });
});

describe("soft-limit flags", () => {
  it("flags a free user over the repo limit", () => {
    const u = user({ plan: "pro", dodoSubscriptionStatus: "active" });
    expect(isOverRepoLimit(u, 6)).toBe(true);
    expect(isOverRepoLimit(u, 5)).toBe(false);
  });

  it("flags a user over the daily gen cap", () => {
    const u = user({ plan: "pro", dodoSubscriptionStatus: "active" });
    expect(isOverDailyGenLimit(u, 25)).toBe(true);
    expect(isOverDailyGenLimit(u, 24)).toBe(false);
  });

  it("pauses auto-regen when over the daily cap", () => {
    const u = user({ plan: "pro", dodoSubscriptionStatus: "active" });
    expect(shouldPauseAutoRegen(u, 25)).toBe(true);
    expect(shouldPauseAutoRegen(u, 24)).toBe(false);
  });

  it("softLimitFlag surfaces both over-limit states and the upgrade target", () => {
    const u = user({ plan: "pro", dodoSubscriptionStatus: "active" });
    expect(
      softLimitFlag(u, 6, 24),
    ).toEqual({
      overRepoLimit: true,
      overDailyGenLimit: false,
      upgradeTo: "team",
    });

    expect(
      softLimitFlag(u, 4, 25),
    ).toEqual({
      overRepoLimit: false,
      overDailyGenLimit: true,
      upgradeTo: "team",
    });

    const freeUser = user({ plan: "free" });
    expect(
      softLimitFlag(freeUser, 1, 5),
    ).toEqual({
      overRepoLimit: false,
      overDailyGenLimit: true,
      upgradeTo: "pro",
    });
  });

  it("returns null upgrade target on the team tier; over = strictly past repo limit, at-or-past daily cap", () => {
    const u = user({ plan: "team", dodoSubscriptionStatus: "active" });
    // Repo limit is strict (>) : at 20 is OK, 21 is over.
    // Daily cap is at-or-past (>=): 100 used = over.
    expect(
      softLimitFlag(u, 20, 99),
    ).toEqual({
      overRepoLimit: false,
      overDailyGenLimit: false,
      upgradeTo: null,
    });
    expect(
      softLimitFlag(u, 21, 100),
    ).toEqual({
      overRepoLimit: true,
      overDailyGenLimit: true,
      upgradeTo: null,
    });
  });
});

describe("checkConnectEligibility — repo-count gate", () => {
  it("allows the first public repo on free", () => {
    withEnv({}, () => {
      const result = checkConnectEligibility({
        plan: "free",
        connectedCount: 0,
        isPrivate: false,
      });
      expect(result).toEqual({ ok: true });
    });
  });

  it("blocks a second repo on free and names the Pro benefits", () => {
    withEnv({}, () => {
      const result = checkConnectEligibility({
        plan: "free",
        connectedCount: 1,
        isPrivate: false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("repo_limit");
        expect(result.error).toBe("repo_limit_reached");
        expect(result.status).toBe(403);
        expect(result.upgradeTo).toBe("pro");
        expect(result.message).toContain("Pro");
        expect(result.message).toContain("private");
        expect(result.message).toContain("auto-regenerate");
        expect(result.message).toContain("scheduled");
        expect(result.message).toContain("subdomain");
        expect(result.message).toContain("branding");
      }
    });
  });

  it("blocks free users over the grandfathered limit (legacy >1 repo can't add more)", () => {
    withEnv({}, () => {
      const result = checkConnectEligibility({
        plan: "free",
        connectedCount: 3,
        isPrivate: false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("repo_limit");
    });
  });

  it("allows a pro user under the limit and blocks at 5 with a Team upsell", () => {
    withEnv({}, () => {
      expect(
        checkConnectEligibility({ plan: "pro", connectedCount: 4, isPrivate: false }),
      ).toEqual({ ok: true });

      const result = checkConnectEligibility({
        plan: "pro",
        connectedCount: 5,
        isPrivate: false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.upgradeTo).toBe("team");
        expect(result.message).toContain("Team");
      }
    });
  });

  it("blocks a team user at the top-tier limit without an upsell", () => {
    withEnv({}, () => {
      const result = checkConnectEligibility({
        plan: "team",
        connectedCount: 20,
        isPrivate: false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.upgradeTo).toBeNull();
    });
  });
});

describe("checkConnectEligibility — private-repo gate", () => {
  it("blocks a private repo on free and names the Pro benefits", () => {
    withEnv({}, () => {
      const result = checkConnectEligibility({
        plan: "free",
        connectedCount: 0,
        isPrivate: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("private_repos");
        expect(result.error).toBe("private_repos_upgrade");
        expect(result.upgradeTo).toBe("pro");
        expect(result.message).toContain("Private repos");
        expect(result.message).toContain("Pro");
        expect(result.message).toContain("auto-regenerate");
        expect(result.message).toContain("scheduled");
        expect(result.message).toContain("subdomain");
        expect(result.message).toContain("branding");
      }
    });
  });

  it("allows private repos on pro and team", () => {
    withEnv({}, () => {
      expect(
        checkConnectEligibility({ plan: "pro", connectedCount: 0, isPrivate: true }),
      ).toEqual({ ok: true });
      expect(
        checkConnectEligibility({ plan: "team", connectedCount: 0, isPrivate: true }),
      ).toEqual({ ok: true });
    });
  });
});
