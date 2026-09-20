import { afterEach, describe, expect, it } from "vitest";
import {
  allowsAutoRegenerate,
  allowsPrivateRepos,
  brandingRequired,
  checkConnectEligibility,
  dailyGenerationLimitFor,
  effectivePlan,
  maxReposFor,
  type BillingUser,
} from "./billing";

/** Save/restore the DOCLOOM_* env vars each limit test touches. */
const ENV_KEYS = [
  "DOCLOOM_DAILY_GENERATION_LIMIT",
  "DOCLOOM_DAILY_LIMIT_STARTER",
  "DOCLOOM_DAILY_LIMIT_TEAM",
  "DOCLOOM_MAX_REPOS_FREE",
  "DOCLOOM_MAX_REPOS_STARTER",
  "DOCLOOM_MAX_REPOS_TEAM",
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
  it("returns free for anything that is not starter/team", () => {
    expect(effectivePlan(user({ plan: null }))).toBe("free");
    expect(effectivePlan(user({ plan: "free" }))).toBe("free");
    expect(effectivePlan(user({ plan: "pro" }))).toBe("free");
  });

  it("honors a paid plan only with a live subscription", () => {
    expect(
      effectivePlan(user({ plan: "starter", dodoSubscriptionStatus: "active" })),
    ).toBe("starter");
    expect(
      effectivePlan(user({ plan: "team", dodoSubscriptionStatus: "active" })),
    ).toBe("team");
  });

  it("drops to free for null and terminal subscription statuses", () => {
    for (const status of [null, "cancelled", "expired", "failed"]) {
      expect(
        effectivePlan(user({ plan: "starter", dodoSubscriptionStatus: status })),
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
      plan: "starter",
      dodoSubscriptionStatus: "on_hold",
      dodoGraceUntil: new Date(Date.now() - 1000),
    });
    expect(effectivePlan(expiredGrace)).toBe("free");

    const noGrace = user({
      plan: "starter",
      dodoSubscriptionStatus: "on_hold",
      dodoGraceUntil: null,
    });
    expect(effectivePlan(noGrace)).toBe("free");
  });
});

describe("dailyGenerationLimitFor", () => {
  it("defaults to Free 5 / Starter 25 / Team 100 per day", () => {
    withEnv({}, () => {
      expect(dailyGenerationLimitFor("free")).toBe(5);
      expect(dailyGenerationLimitFor("starter")).toBe(25);
      expect(dailyGenerationLimitFor("team")).toBe(100);
    });
  });

  it("honors env overrides", () => {
    withEnv({ DOCLOOM_DAILY_LIMIT_STARTER: "40" }, () => {
      expect(dailyGenerationLimitFor("starter")).toBe(40);
    });
  });
});

describe("maxReposFor", () => {
  it("defaults to Free 1 / Starter 5 / Team 20", () => {
    withEnv({}, () => {
      expect(maxReposFor("free")).toBe(1);
      expect(maxReposFor("starter")).toBe(5);
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
    expect(allowsPrivateRepos("starter")).toBe(true);
    expect(allowsPrivateRepos("team")).toBe(true);
  });

  it("auto-regenerate: paid only", () => {
    expect(allowsAutoRegenerate("free")).toBe(false);
    expect(allowsAutoRegenerate("starter")).toBe(true);
    expect(allowsAutoRegenerate("team")).toBe(true);
  });

  it("branding: free only", () => {
    expect(brandingRequired("free")).toBe(true);
    expect(brandingRequired("starter")).toBe(false);
    expect(brandingRequired("team")).toBe(false);
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

  it("blocks a second repo on free and names the Starter benefits", () => {
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
        expect(result.upgradeTo).toBe("starter");
        expect(result.message).toContain("Starter");
        expect(result.message).toContain("private");
        expect(result.message).toContain("auto-regenerate");
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

  it("allows a starter user under the limit and blocks at 5 with a Team upsell", () => {
    withEnv({}, () => {
      expect(
        checkConnectEligibility({ plan: "starter", connectedCount: 4, isPrivate: false }),
      ).toEqual({ ok: true });

      const result = checkConnectEligibility({
        plan: "starter",
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
  it("blocks a private repo on free and names the Starter benefits", () => {
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
        expect(result.upgradeTo).toBe("starter");
        expect(result.message).toContain("Private repos");
        expect(result.message).toContain("Starter");
        expect(result.message).toContain("auto-regenerate");
        expect(result.message).toContain("branding");
      }
    });
  });

  it("allows private repos on starter and team", () => {
    withEnv({}, () => {
      expect(
        checkConnectEligibility({ plan: "starter", connectedCount: 0, isPrivate: true }),
      ).toEqual({ ok: true });
      expect(
        checkConnectEligibility({ plan: "team", connectedCount: 0, isPrivate: true }),
      ).toEqual({ ok: true });
    });
  });
});
