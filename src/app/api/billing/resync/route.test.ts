import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level tests for POST /api/billing/resync with a mocked Dodo API:
 *  - fail-closed when the API is unreachable (never strips paid access),
 *  - highest active tier wins,
 *  - unknown product keeps the current plan (never guesses downward),
 *  - on_hold keeps the plan with a fresh 7-day grace window,
 *  - nothing active → downgrade to free,
 *  - no linked customer → no-database-write no-op.
 */

const { sessionMock, dodoMock, dbMock } = vi.hoisted(() => ({
  sessionMock: { getAuthorizedUser: vi.fn() },
  dodoMock: {
    listCustomerSubscriptions: vi.fn(),
    isTerminalStatus: vi.fn((s?: string) => s === "cancelled" || s === "expired" || s === "failed"),
    planForProduct: vi.fn((productId?: string) => {
      if (productId === "prod_pro") return "pro";
      if (productId === "prod_team") return "team";
      return null;
    }),
    dodoEnabled: vi.fn(() => true),
  },
  dbMock: { updates: [] as { patch: Record<string, unknown> }[] },
}));

vi.mock("@/lib/session", () => ({ getAuthorizedUser: sessionMock.getAuthorizedUser }));

vi.mock("@/lib/dodo", () => ({
  listCustomerSubscriptions: dodoMock.listCustomerSubscriptions,
  isTerminalStatus: dodoMock.isTerminalStatus,
  planForProduct: dodoMock.planForProduct,
  dodoEnabled: dodoMock.dodoEnabled,
}));

vi.mock("@/lib/db", () => {
  const col = (name: string) => ({ name });
  const users = {
    id: col("id"),
    plan: col("plan"),
    dodoSubscriptionId: col("dodo_subscription_id"),
    dodoSubscriptionStatus: col("dodo_subscription_status"),
    dodoGraceUntil: col("dodo_grace_until"),
    updatedAt: col("updated_at"),
  };
  const webhookEvents = { eventType: col("event_type"), receivedAt: col("received_at") };
  const dbInstance = {
    update() {
      return {
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            dbMock.updates.push({ patch });
          },
        }),
      };
    },
    select() {
      return {
        from: () => ({
          where: () => ({
            limit: async () => [],
            orderBy: () => ({ limit: async () => [] }),
          }),
          orderBy: () => ({ limit: async () => [] }),
        }),
      };
    },
  };
  return { db: dbInstance, users, webhookEvents };
});

vi.mock("@/lib/route-wrapper", () => ({
  withRouteErrors: (_name: string, handler: unknown) => handler,
}));

import { POST } from "./route";

const AUTHED = {
  user: {
    id: "u1",
    email: "u@example.com",
    login: "testuser",
    plan: "free",
    dodoCustomerId: "cus_1",
    dodoSubscriptionId: null,
    dodoSubscriptionStatus: null,
    dodoGraceUntil: null,
  },
};

function sub(id: string, status: string, product: string): {
  subscription_id: string;
  status: string;
  product_id: string;
} {
  return { subscription_id: id, status, product_id: product };
}

beforeEach(() => {
  dbMock.updates = [];
  sessionMock.getAuthorizedUser.mockReset().mockResolvedValue(AUTHED);
  dodoMock.listCustomerSubscriptions.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/billing/resync", () => {
  it("401s unauthenticated", async () => {
    sessionMock.getAuthorizedUser.mockResolvedValue(null);
    const res = await (POST as () => Promise<Response>)();
    expect(res.status).toBe(401);
  });

  it("503s when Dodo is unavailable — fail-closed, no DB write", async () => {
    dodoMock.listCustomerSubscriptions.mockResolvedValue(null);
    const res = await (POST as () => Promise<Response>)();
    expect(res.status).toBe(503);
    expect(dbMock.updates).toHaveLength(0);
  });

  it("highest active tier wins (team over pro)", async () => {
    dodoMock.listCustomerSubscriptions.mockResolvedValue([
      sub("s_pro", "active", "prod_pro"),
      sub("s_team", "active", "prod_team"),
    ]);
    const res = await (POST as () => Promise<Response>)();
    expect(res.status).toBe(200);
    const patch = dbMock.updates[0].patch;
    expect(patch.plan).toBe("team");
    expect(patch.dodoSubscriptionId).toBe("s_team");
    expect(patch.dodoSubscriptionStatus).toBe("active");
  });

  it("unknown product id keeps the current plan (never guesses downward)", async () => {
    dodoMock.listCustomerSubscriptions.mockResolvedValue([sub("s_u", "active", "prod_unknown")]);
    const res = await (POST as () => Promise<Response>)();
    const patch = dbMock.updates[0].patch;
    expect(res.status).toBe(200);
    expect(patch.plan).toBe("free"); // current plan carried through
    expect(patch.dodoSubscriptionStatus).toBe("active");
  });

  it("on_hold: keeps the plan with a fresh 7-day grace window", async () => {
    dodoMock.listCustomerSubscriptions.mockResolvedValue([sub("s_h", "on_hold", "prod_pro")]);
    const before = Date.now();
    const res = await (POST as () => Promise<Response>)();
    const patch = dbMock.updates[0].patch as { dodoSubscriptionStatus: string; dodoGraceUntil: Date; plan: string };
    expect(res.status).toBe(200);
    expect(patch.dodoSubscriptionStatus).toBe("on_hold");
    expect(patch.plan).toBeDefined();
    expect(patch.dodoGraceUntil.getTime()).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000);
  });

  it("nothing live: downgrade to free with the last known terminal status", async () => {
    dodoMock.listCustomerSubscriptions.mockResolvedValue([
      sub("s_c", "cancelled", "prod_pro"),
    ]);
    const res = await (POST as () => Promise<Response>)();
    const patch = dbMock.updates[0].patch as { plan: string; dodoGraceUntil: unknown };
    expect(res.status).toBe(200);
    expect(patch.plan).toBe("free");
    expect(patch.dodoGraceUntil).toBeNull();
  });

  it("no linked customer: no-op with the explanation (no DB write)", async () => {
    sessionMock.getAuthorizedUser.mockResolvedValue({
      ...AUTHED,
      user: { ...AUTHED.user, dodoCustomerId: null },
    });
    const res = await (POST as () => Promise<Response>)();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { resynced?: boolean; reason?: string };
    expect(json.resynced).toBe(false);
    expect(json.reason).toBe("no_dodo_customer_linked");
    expect(dbMock.updates).toHaveLength(0);
    expect(dodoMock.listCustomerSubscriptions).not.toHaveBeenCalled();
  });
});
