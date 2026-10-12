import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Route-level tests for POST /api/billing/checkout with a fully mocked Dodo
 * client: auth gate, billing-unavailable gate, plan validation (mapping to
 * the right product happens inside lib/dodo — asserted via call args), and
 * the happy path that returns the hosted checkout URL.
 */

const { sessionMock, dodoMock } = vi.hoisted(() => ({
  sessionMock: {
    getAuthorizedUser: vi.fn(),
  },
  dodoMock: {
    createCheckoutSession: vi.fn(),
    dodoEnabled: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({
  getAuthorizedUser: sessionMock.getAuthorizedUser,
  SESSION_COOKIE: "docloom_session",
}));

vi.mock("@/lib/dodo", () => ({
  createCheckoutSession: dodoMock.createCheckoutSession,
  dodoEnabled: dodoMock.dodoEnabled,
}));

vi.mock("@/lib/env", () => ({ appUrl: () => "https://docloom.example" }));
vi.mock("@/lib/rate-limit", () => ({
  cleanupStaleBuckets: () => {},
  rateLimit: () => ({ ok: true, retryAfterSeconds: 0 }),
}));
vi.mock("@/lib/route-wrapper", () => ({
  withRouteErrors: (_name: string, handler: unknown) => handler,
}));

import { POST } from "./route";

function request(plan: string): NextRequest {
  return new Request("https://docloom.example/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan }),
  }) as unknown as NextRequest;
}

const AUTHED = {
  user: { id: "u1", email: "u@example.com", name: "Test User", login: "testuser" },
};

beforeEach(() => {
  dodoMock.createCheckoutSession.mockReset();
  dodoMock.dodoEnabled.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/billing/checkout", () => {
  it("401s without an authenticated session", async () => {
    sessionMock.getAuthorizedUser.mockResolvedValue(null);
    const res = await POST(request("pro"));
    expect(res.status).toBe(401);
    expect(dodoMock.dodoEnabled).not.toHaveBeenCalled();
  });

  it("503s billing_unavailable while Dodo is not configured", async () => {
    sessionMock.getAuthorizedUser.mockResolvedValue(AUTHED);
    dodoMock.dodoEnabled.mockReturnValue(false);
    const res = await POST(request("pro"));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("billing_unavailable");
    expect(dodoMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("400s on an invalid plan (free is not for sale)", async () => {
    sessionMock.getAuthorizedUser.mockResolvedValue(AUTHED);
    dodoMock.dodoEnabled.mockReturnValue(true);
    const res = await POST(request("free"));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBe("invalid_plan");
    expect(dodoMock.createCheckoutSession).not.toHaveBeenCalled();
  });

  it("maps plan=pro to the Dodo pro product and returns the hosted URL", async () => {
    sessionMock.getAuthorizedUser.mockResolvedValue(AUTHED);
    dodoMock.dodoEnabled.mockReturnValue(true);
    dodoMock.createCheckoutSession.mockResolvedValue({
      session_id: "sess_1",
      checkout_url: "https://test.dodopayments.com/checkout/sess_1",
    });

    const res = await POST(request("pro"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { checkoutUrl?: string; sessionId?: string };
    expect(json.checkoutUrl).toContain("/checkout/sess_1");
    expect(json.sessionId).toBe("sess_1");

    const [call] = dodoMock.createCheckoutSession.mock.calls[0] as unknown as [
      { plan: string; email: string; name: string; returnUrl: string },
    ];
    expect(call.plan).toBe("pro");
    expect(call.email).toBe("u@example.com");
    expect(call.name).toBe("Test User");
    expect(call.returnUrl).toBe("https://docloom.example/dashboard?checkout=return");
  });

  it("maps plan=team to the team product", async () => {
    sessionMock.getAuthorizedUser.mockResolvedValue(AUTHED);
    dodoMock.dodoEnabled.mockReturnValue(true);
    dodoMock.createCheckoutSession.mockResolvedValue({
      session_id: "sess_2",
      checkout_url: "https://live.dodopayments.com/checkout/sess_2",
    });

    await POST(request("team"));
    const [call] = dodoMock.createCheckoutSession.mock.calls[0] as unknown as [
      { plan: string },
    ];
    expect(call.plan).toBe("team");
  });

  it("never leaks product ids or API keys in any response field", async () => {
    sessionMock.getAuthorizedUser.mockResolvedValue(AUTHED);
    dodoMock.dodoEnabled.mockReturnValue(true);
    dodoMock.createCheckoutSession.mockResolvedValue({
      session_id: "sess_3",
      checkout_url: "https://live.dodopayments.com/checkout/sess_3",
    });
    process.env.DODO_API_KEY = "sk_live_SECRET";
    process.env.DODO_PRO_PRODUCT_ID = "prod_pro_SECRET";

    const res = await POST(request("pro"));
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("sk_live_SECRET");
    expect(text).not.toContain("prod_pro_SECRET");
    delete process.env.DODO_API_KEY;
    delete process.env.DODO_PRO_PRODUCT_ID;
  });
});
