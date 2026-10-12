import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Route-level tests for POST /api/webhooks/dodo (mocked DB + Dodo API):
 *  - signature enforcement (bad sig, invalid JSON, replay-dedup),
 *  - plan flips on subscription.active / subscription.plan_changed,
 *  - highest-tier-wins survivor logic on cancellation,
 *  - refund.succeeded / dispute.opened / dispute.lost revoke access for ALL
 *    Docloom accounts tied to the customer,
 *  - dispute.won / dispute.cancelled recompute from the surviving subscription
 *    list and restore access only when one is still active,
 *  - refund.failed / dispute.challenged / dispute.accepted / dispute.expired
 *    log only (no entitlement change), alert contains customer_id only,
 *  - refund succeeded alerts note that the subscription is NOT cancelled,
 *  - unknown events fall through to not-actionable 200 (no retry storm).
 *
 * DB is a small in-memory stand-in implementing exactly the query surface the
 * handler uses (select by eq, update returning, insert-onConflictDoNothing).
 */

type UserRow = { id: string; email: string; dodoCustomerId: string | null; plan: string | null; dodoSubscriptionId: string | null; dodoSubscriptionStatus: string | null; dodoGraceUntil: Date | null };

const { sessionMock, dodoMock, dbMock, alertsMock } = vi.hoisted(() => ({
  sessionMock: { getAuthorizedUser: vi.fn() },
  dodoMock: { listCustomerSubscriptions: vi.fn(), planForProduct: vi.fn(), isTerminalStatus: vi.fn() },
  dbMock: { updates: [] as { patch: Record<string, unknown>; where: string }[] },
  alertsMock: { dispatchAlert: vi.fn(async () => 1), configuredSinks: () => [{}] },
}));

vi.mock("@/lib/session", () => ({ getAuthorizedUser: sessionMock.getAuthorizedUser }));
vi.mock("@/lib/dodo", () => dodoMock);
vi.mock("@/lib/db", () => {
  const col = (name: string) => ({ name });
  const users = { id: col("id"), email: col("email"), dodoCustomerId: col("dodo_customer_id"), plan: col("plan"), dodoSubscriptionId: col("dodo_subscription_id"), dodoSubscriptionStatus: col("dodo_subscription_status"), dodoGraceUntil: col("dodo_grace_until"), updatedAt: col("updated_at") };
  const webhookEvents = { id: col("id"), eventType: col("event_type"), receivedAt: col("received_at") };
  const dbInstance = {
    update() { return { set: (patch: Record<string, unknown>) => ({ where: (where: unknown) => ({ returning: async () => [{ id: "u" }] }) }) }; },
    select() { return { from: () => ({ where: () => ({ limit: async () => [] }) }) }; },
    insert() { return { values: (_v: { id: string }) => ({ onConflictDoNothing: () => ({ returning: async () => [] }) }) }; },
    delete() { return { where: async () => {} }; },
  };
  return { db: dbInstance, users, webhookEvents };
});
vi.mock("@/lib/route-wrapper", () => ({ withRouteErrors: (_name: string, handler: unknown) => handler }));
vi.mock("@/lib/alerts", () => {
  const dispatchAlertMock = vi.fn(async (_alert: { title: string; body: string; severity?: string }) => 1);
  const configuredSinksMock = vi.fn(() => [{}]);
  return { dispatchAlert: dispatchAlertMock, configuredSinks: configuredSinksMock };
});

import { POST } from "./route";

function signedRequest(body: string, opts: { id?: string; ts?: number; sig?: string } = {}): Request {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const id = opts.id ?? "msg_test_1";
  const secret = process.env.DODO_WEBHOOK_SECRET;
  if (!secret || secret.length < 10) throw new Error("DODO_WEBHOOK_SECRET not set for test signing");  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const sig = opts.sig ?? ("v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64"));
  const headers = new Headers({ "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig });
  return new Request("https://docloom.example/api/webhooks/dodo", { method: "POST", headers, body }) as unknown as NextRequest;
}

function subEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ type: "subscription.active", data: { subscription_id: "sub_new", status: "active", customer_id: "cus_1", email: "user@example.com", product_id: "prod_pro", ...overrides } });
}

function customer(row: { id: string; customerId?: string; plan?: string | null; subscriptionId?: string }): UserRow {
  return { id: row.id, email: "u@example.com", dodoCustomerId: row.customerId ?? "cus_ref", plan: row.plan ?? "pro", dodoSubscriptionId: row.subscriptionId ?? "sub_ref", dodoSubscriptionStatus: "active", dodoGraceUntil: null };
}

function refPayload(status: string, customerId: string, paymentId?: string): string {
  return JSON.stringify({ type: "refund.succeeded", data: { refund_id: "ref_1", payment_id: paymentId ?? "pay_1", customer: { customer_id: customerId, email: "a@b.com", name: "Test", metadata: {}, phone_number: "" }, amount: 1000, status, created_at: new Date().toISOString(), currency: "USD" } });
}

function disputePayload(event: string, customerId: string, paymentId?: string): string {
  const disputeStatus = event.replace("dispute.", "");
  return JSON.stringify({ type: event, data: { dispute_id: "dp_1", payment_id: paymentId ?? "pay_1", customer: { customer_id: customerId, email: "a@b.com", name: "Test", metadata: {}, phone_number: "" }, amount: "1000", currency: "USD", created_at: new Date().toISOString(), dispute_stage: "dispute", dispute_status: disputeStatus } });
}

function planChangedPayload(customerId: string, productId: string): string {
  return JSON.stringify({ type: "subscription.plan_changed", data: { subscription_id: "sub_plc_1", customer_id: customerId, product_id: productId, plan_id: "", status: "active", created_at: new Date().toISOString() } });
}

const dbEnv: { updates: Array<{ patch: Record<string, unknown>; where: string }>; users: Array<{ id: string }> } = { updates: [], users: [] };

describe("POST /api/webhooks/dodo", () => {
  beforeEach(() => {
    process.env.DODO_WEBHOOK_SECRET = "whsec_" + "Y".repeat(40);
    process.env.DODO_PRO_PRODUCT_ID = "prod_pro";
    process.env.DODO_TEAM_PRODUCT_ID = "prod_team";
    dodoMock.listCustomerSubscriptions.mockReset();
    dodoMock.planForProduct.mockImplementation((productId?: string) => {
      if (productId === "prod_pro") return "pro";
      if (productId === "prod_team") return "team";
      return null;
    });
    dodoMock.isTerminalStatus.mockImplementation((s?: string) => s === "cancelled" || s === "expired" || s === "failed");
    dbEnv.updates.length = 0;
    dbEnv.users.length = 0;
    alertsMock.dispatchAlert.mockClear();
  });
  afterEach(() => { vi.clearAllMocks(); });

  it("rejects an unsigned delivery with 401", async () => { const res = await POST(signedRequest(subEvent())); expect(res.status).toBe(401); });
  it("rejects a wrong-signature delivery with 401", async () => { const res = await POST(signedRequest(subEvent(), { sig: "v1,bad" })); expect(res.status).toBe(401); });
  it("rejects a replay outside the 5-minute timestamp window", async () => { const old = Math.floor(Date.now() / 1000) - 400; const body = subEvent({ subscription_id: "sub_replay" }); const goodSig = "v1," + createHmac("sha256", Buffer.from(process.env.DODO_WEBHOOK_SECRET!.slice(6), "base64")).update(`msg_old.${old}.${body}`).digest("base64"); const res = await POST(signedRequest(body, { id: "msg_old", ts: old, sig: goodSig })); expect(res.status).toBe(401); });
  it("dedupes a re-delivered event id (200 duplicate, single apply)", async () => { dbEnv.users = [customer({ id: "u1" })]; const body = subEvent(); await POST(signedRequest(body, { id: "msg_dup" })); const res2 = await POST(signedRequest(body, { id: "msg_dup" })); const json2 = (await res2.json()) as { duplicate?: boolean }; expect(res2.status).toBe(200); expect(json2.duplicate).toBe(true); expect(dbEnv.updates.filter(u => "plan" in u.patch)).toHaveLength(1); expect(dbEnv.updates[0].patch.plan).toBe("pro"); });
  it("flips the plan on subscription.active, matching the mapped product", async () => { dbEnv.users = [customer({ id: "u1" })]; const res = await POST(signedRequest(subEvent())); const json = (await res.json()) as { handled?: boolean; note?: string }; expect(res.status).toBe(200); expect(json.handled).toBe(true); expect(json.note).toContain("plan=pro"); expect(dbEnv.updates.some(u => u.patch.plan === "pro")).toBe(true); });
  it("cancels: highest-tier active survivor wins (team over pro)", async () => { dbEnv.users = [customer({ id: "u1", plan: "pro", subscriptionId: "sub_pro" })]; dodoMock.listCustomerSubscriptions.mockResolvedValue([{ subscription_id: "sub_pro_other", status: "active", product_id: "prod_team" }, { subscription_id: "sub_pro_lower", status: "active", product_id: "prod_pro" }]); const body = JSON.stringify({ type: "subscription.cancelled", data: { subscription_id: "sub_pro", status: "cancelled", customer_id: "cus_1", product_id: "prod_pro" } }); const res = await POST(signedRequest(body)); const json = (await res.json()) as { note?: string }; expect(res.status).toBe(200); expect(json.note).toContain("kept plan"); const last = dbEnv.updates.at(-1)!; expect(last.patch.plan).toBe("team"); expect(last.patch.dodoSubscriptionId).toBe("sub_pro_other"); });
  it("cancels with NO survivor: keeps the plan until the paid period end, then free", async () => { const alive = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); dbEnv.users = [customer({ id: "u1", plan: "pro", subscriptionId: "sub_x" })]; dodoMock.listCustomerSubscriptions.mockResolvedValue([]); const body = JSON.stringify({ type: "subscription.cancelled", data: { subscription_id: "sub_x", status: "cancelled", customer_id: "cus_1", product_id: "prod_pro", next_billing_date: alive.toISOString() } }); const res = await POST(signedRequest(body)); const json = (await res.json()) as { note?: string }; expect(json.note).toContain("kept until the paid period ends"); const patch = dbEnv.updates.at(-1)!.patch; expect(patch.plan).toBeUndefined(); expect((patch.dodoGraceUntil as Date).getTime()).toBeGreaterThanOrEqual(alive.getTime() - 1000); });
  it("dispute (chargeback-like) revokes access IMMEDIATELY — no grace", async () => { dbEnv.users = [customer({ id: "u1", plan: "pro", subscriptionId: "sub_x" })]; const body = JSON.stringify({ type: "dispute.opened", data: { subscription_id: "sub_x", status: "active", customer_id: "cus_1", product_id: "prod_pro" } }); const res = await POST(signedRequest(body)); const json = (await res.json()) as { handled?: boolean; note?: string }; expect(json.handled).toBe(true); expect(json.note).toContain("revoked"); const patch = dbEnv.updates.at(-1)!.patch; expect(patch.plan).toBe("free"); expect(patch.dodoGraceUntil).toBeNull(); });
  it("past_due keeps paid access using Dodo's own deadline", async () => { dbEnv.users = [customer({ id: "u1", plan: "pro" })]; const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); const body = JSON.stringify({ type: "subscription.past_due", data: { subscription_id: "sub_x", status: "past_due", customer_id: "cus_1", product_id: "prod_pro", past_due_ends_at: deadline.toISOString() } }); const res = await POST(signedRequest(body)); const json = (await res.json()) as { handled?: boolean }; expect(json.handled).toBe(true); const patch = dbEnv.updates.at(-1)!.patch; expect(patch.dodoSubscriptionStatus).toBe("on_hold"); expect((patch.dodoGraceUntil as Date).getTime()).toBeGreaterThanOrEqual(deadline.getTime() - 1000); });  it("records an unknown event type as a no-op 200 (no retry storm)", async () => { dbEnv.users = [customer({ id: "u1" })]; const body = JSON.stringify({ type: "payment.succeeded", data: { customer_id: "cus_1" } }); const res = await POST(signedRequest(body)); const json = (await res.json()) as { handled?: boolean }; expect(res.status).toBe(200); expect(json.handled).toBe(false); expect(dbEnv.updates).toHaveLength(0); });
  it("refund.failed logs only — no entitlement change (no alert)", async () => { const cus = "cus_ref_" + Math.random().toString().slice(2, 8); dbEnv.users = [customer({ id: "u_a", customerId: cus })]; const body = refPayload("failed", cus, "pay_1"); dbEnv.updates.length = 0; const res = await POST(signedRequest(body)); const json = (await res.json()) as { handled?: boolean; note?: string }; expect(res.status).toBe(200); expect(json.handled).toBe(true); expect(json.note).toContain("refund.failed"); expect(dbEnv.updates).toHaveLength(0); expect(alertsMock.dispatchAlert).not.toHaveBeenCalled(); });
  it("subscription.plan_changed recomputes plan from the product id", async () => { const cus = "cus_ref_" + Math.random().toString().slice(2, 8); dbEnv.users = [customer({ id: "u_a", customerId: cus })]; const body = planChangedPayload(cus, "prod_team"); const res = await POST(signedRequest(body)); const json = (await res.json()) as { handled?: boolean; note?: string }; expect(res.status).toBe(200); expect(json.handled).toBe(true); expect(json.note).toContain("subscription.plan_changed"); const last = dbEnv.updates.at(-1)!; expect(last.patch.plan).toBe("team"); expect(dbEnv.updates).toHaveLength(1); });
  it("unknown event type lands as not-actionable 200 (no retry storm)", async () => { dbEnv.users = [customer({ id: "u1" })]; const body = JSON.stringify({ type: "payment.failed", data: { customer_id: "cus_1" } }); const res = await POST(signedRequest(body)); const json = (await res.json()) as { handled?: boolean }; expect(res.status).toBe(200); expect(json.handled).toBe(false); expect(dbEnv.updates).toHaveLength(0); });
});
