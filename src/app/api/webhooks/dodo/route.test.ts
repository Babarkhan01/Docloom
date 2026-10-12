import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Route-level tests for POST /api/webhooks/dodo (mocked DB + Dodo API):
 *  - signature enforcement (unsigned and wrong-signed → 401),
 *  - replay dedup via the webhook_events idempotency row,
 *  - plan flip on subscription.active,
 *  - highest-tier-wins survivor logic on cancellation,
 *  - refund/dispute revokes immediately (no grace),
 *  - cancel keeps the plan until the paid period end (next_billing_date).
 *
 * DB is a small in-memory stand-in implementing exactly the query surface the
 * handler uses (select/update/insert-onConflictDoNothing/delete by eq/and).
 */

type UserRow = {
  id: string;
  email: string;
  dodoCustomerId: string | null;
  plan: string | null;
  dodoSubscriptionId: string | null;
  dodoSubscriptionStatus: string | null;
  dodoGraceUntil: Date | null;
};

const { dbMock, dodoMock } = vi.hoisted(() => {
  type Eq = { col: string; val: unknown };
  const eqMock = (col: unknown, val: unknown): Eq => ({
    col: (col as { name?: string }).name ?? String(col),
    val,
  });
  return {
    dbMock: {
      eqMock,
      users: [] as UserRow[],
      events: new Set<string>(),
      updates: [] as { table: string; patch: Record<string, unknown>; where: string }[],
    },
    dodoMock: {
      listCustomerSubscriptions: vi.fn(),
      getCustomerEmail: vi.fn(),
      planForProduct: vi.fn((productId?: string) => {
        if (productId === "prod_pro") return "pro";
        if (productId === "prod_team") return "team";
        return null;
      }),
    },
  };
});

vi.mock("@/lib/db", () => {
  // Column objects only need .name for our mock eq/where matching.
  const col = (name: string) => ({ name });
  const users = {
    id: col("id"),
    email: col("email"),
    dodoCustomerId: col("dodo_customer_id"),
    plan: col("plan"),
    dodoSubscriptionId: col("dodo_subscription_id"),
    dodoSubscriptionStatus: col("dodo_subscription_status"),
    dodoGraceUntil: col("dodo_grace_until"),
    updatedAt: col("updated_at"),
  };
  const webhookEvents = { id: col("id"), eventType: col("event_type"), receivedAt: col("received_at") };

  // Evaluate a drizzle eq/and tree against a user row. Drizzle SQL nodes
  // serialize as { queryChunks: [...] }, where eq(col, val) renders as a
  // chunk shaped { name } (column) followed by the raw value.
  function evalWhere(row: UserRow, where: unknown): boolean {
    if (Array.isArray(where)) return where.every((c) => evalWhere(row, c));
    const node = where as { queryChunks?: unknown[] } | null;
    if (!node || !Array.isArray(node.queryChunks)) return true; // unrecognized: don't filter
    // An eq node has exactly: [empty, column, ' = ', value, empty].
    const chunks = node.queryChunks as Array<Record<string, unknown>>;
    const colChunk = chunks.find((ch) => "name" in ch) as { name?: string } | undefined;
    const colName = colChunk?.name;
    const valChunk = chunks.findLast((ch) => typeof ch === "string") as string | undefined;
    if (!colName || valChunk === undefined) return true;
    const field =
      colName === "id" ? row.id :
      colName === "email" ? row.email :
      colName === "dodo_customer_id" ? row.dodoCustomerId :
      colName === "dodo_subscription_id" ? row.dodoSubscriptionId :
      undefined;
    return field === valChunk;
  }

  const dbInstance = {
    select() {
      return {
        from: () => ({
          where: (where: unknown) => ({
            limit: async () =>
              dbMock.users.filter((r) => evalWhere(r, where)) as unknown[],
          }),
        }),
      };
    },
    update() {
      return {
        set: (patch: Record<string, unknown>) => ({
          where: (where: unknown) => {
            // Record every update the handler issues (the real handler does
            // not always chain .returning). One record per user row matched.
            const matched = dbMock.users.filter((r) => evalWhere(r, where));
            dbMock.updates.push({
              table: "users",
              patch: { ...patch },
              where: `matched=${matched.length}`,
            });
            return {
              returning: async () => [{ id: "updated" }],
            };
          },
        }),
      };
    },
    insert() {
      return {
        values: (v: { id: string }) => ({
          onConflictDoNothing: () => ({
            returning: async () =>
              dbMock.events.has(v.id) ? [] : (dbMock.events.add(v.id), [{ id: v.id }]),
          }),
        }),
      };
    },
    delete() {
      return { where: async () => {} };
    },
  };
  return { db: dbInstance, users, webhookEvents };
});

vi.mock("@/lib/dodo", () => dodoMock);
vi.mock("@/lib/alerts", () => ({ dispatchAlert: vi.fn(), configuredSinks: () => [] }));
vi.mock("@/lib/wait-until", () => ({
  runAfterResponse: async (fn: () => Promise<void>) => {
    await fn();
  },
}));
vi.mock("@/lib/route-wrapper", () => ({
  withRouteErrors: (_name: string, handler: unknown) => handler,
}));

import { POST } from "./route";

const WEBHOOK_SECRET = "whsec_" + "Y".repeat(40);

function signedRequest(body: string, opts: { id?: string; sig?: string; ts?: number } = {}): NextRequest {
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const id = opts.id ?? "msg_test_1";
  const sig =
    opts.sig ??
    "v1," +
      createHmac("sha256", Buffer.from(WEBHOOK_SECRET.slice(6), "base64"))
        .update(`${id}.${ts}.${body}`)
        .digest("base64");
  const headers = new Headers({
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(ts),
    "webhook-signature": sig,
  });
  return new Request("https://docloom.example/api/webhooks/dodo", {
    method: "POST",
    headers,
    body,
  }) as unknown as NextRequest;
}

function subEvent(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "subscription.active",
    data: {
      subscription_id: "sub_new",
      status: "active",
      customer_id: "cus_1",
      email: "user@example.com",
      product_id: "prod_pro",
      ...overrides,
    },
  });
}

function user(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: "u1",
    email: "user@example.com",
    dodoCustomerId: "cus_1",
    plan: "free",
    dodoSubscriptionId: null,
    dodoSubscriptionStatus: null,
    dodoGraceUntil: null,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.DODO_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.DODO_PRO_PRODUCT_ID = "prod_pro";
  process.env.DODO_TEAM_PRODUCT_ID = "prod_team";
  dbMock.users = [];
  dbMock.updates = [];
  dbMock.events.clear();
  dodoMock.listCustomerSubscriptions.mockReset();
  dodoMock.getCustomerEmail.mockReset();
});

afterEach(() => {
  delete process.env.DODO_WEBHOOK_SECRET;
  vi.clearAllMocks();
});

describe("POST /api/webhooks/dodo", () => {
  it("rejects an unsigned delivery with 401 even in production wiring", async () => {
    const res = await POST(
      new Request("https://docloom.example/api/webhooks/dodo", {
        method: "POST",
        body: subEvent(),
      }) as unknown as NextRequest,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a wrong-signature delivery with 401", async () => {
    const res = await POST(signedRequest(subEvent(), { sig: "v1,bad" }));
    expect(res.status).toBe(401);
  });

  it("rejects a replay outside the 5-minute timestamp window", async () => {
    const old = Math.floor(Date.now() / 1000) - 400;
    const body = subEvent({ subscription_id: "sub_replay" });
    const goodSig =
      "v1," +
      createHmac("sha256", Buffer.from(WEBHOOK_SECRET.slice(6), "base64"))
        .update(`msg_old.${old}.${body}`)
        .digest("base64");
    const res = await POST(signedRequest(body, { id: "msg_old", ts: old, sig: goodSig }));
    expect(res.status).toBe(401);
  });

  it("dedupes a re-delivered event id (200 duplicate, single apply)", async () => {
    dbMock.users = [user()];
    const body = subEvent();
    await POST(signedRequest(body, { id: "msg_dup" }));
    const res2 = await POST(signedRequest(body, { id: "msg_dup" }));
    const json2 = (await res2.json()) as { duplicate?: boolean };
    expect(res2.status).toBe(200);
    expect(json2.duplicate).toBe(true);
    // The plan-flip update ran exactly once for the two deliveries.
    const planUpdates = dbMock.updates.filter((u) => "plan" in u.patch);
    expect(planUpdates).toHaveLength(1);
    expect(planUpdates[0].patch.plan).toBe("pro");
    expect(planUpdates[0].patch.dodoSubscriptionStatus).toBe("active");
  });

  it("flips the plan on subscription.active, matching the mapped product", async () => {
    dbMock.users = [user()];
    const res = await POST(signedRequest(subEvent()));
    const json = (await res.json()) as { handled?: boolean; note?: string };
    expect(res.status).toBe(200);
    expect(json.handled).toBe(true);
    expect(json.note).toContain("plan=pro");
    expect(dbMock.updates.some((u) => u.patch.plan === "pro")).toBe(true);
  });

  it("cancels: highest-tier active survivor wins (team over pro)", async () => {
    dbMock.users = [user({ plan: "pro", dodoSubscriptionId: "sub_pro" })];
    dodoMock.listCustomerSubscriptions.mockResolvedValue([
      { subscription_id: "sub_pro_other", status: "active", product_id: "prod_team" },
      { subscription_id: "sub_pro_lower", status: "active", product_id: "prod_pro" },
    ]);
    const body = JSON.stringify({
      type: "subscription.cancelled",
      data: {
        subscription_id: "sub_pro",
        status: "cancelled",
        customer_id: "cus_1",
        product_id: "prod_pro",
      },
    });
    const res = await POST(signedRequest(body));
    const json = (await res.json()) as { note?: string };
    expect(res.status).toBe(200);
    // Tracked sub re-pointed at the best survivor and plan aligned to team.
    expect(json.note).toContain("kept plan");
    const last = dbMock.updates.at(-1)!;
    expect(last.patch.plan).toBe("team");
    expect(last.patch.dodoSubscriptionId).toBe("sub_pro_other");
  });

  it("cancels with NO survivor: keeps the plan until the paid period end, then free", async () => {
    const alive = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    dbMock.users = [user({ plan: "pro", dodoSubscriptionId: "sub_x" })];
    dodoMock.listCustomerSubscriptions.mockResolvedValue([]);
    const body = JSON.stringify({
      type: "subscription.cancelled",
      data: {
        subscription_id: "sub_x",
        status: "cancelled",
        customer_id: "cus_1",
        product_id: "prod_pro",
        next_billing_date: alive.toISOString(),
      },
    });
    const res = await POST(signedRequest(body));
    const json = (await res.json()) as { note?: string };
    expect(json.note).toContain("kept until the paid period ends");
    const patch = dbMock.updates.at(-1)!.patch;
    expect(patch.plan).toBeUndefined(); // plan column untouched
    expect((patch.dodoGraceUntil as Date).getTime()).toBeGreaterThanOrEqual(
      alive.getTime() - 1000,
    );
  });

  it("dispute (chargeback-like) revokes access IMMEDIATELY — no grace", async () => {
    dbMock.users = [user({ plan: "pro", dodoGraceUntil: new Date(Date.now() + 86400_000) })];
    const body = JSON.stringify({
      type: "dispute.created",
      data: {
        subscription_id: "sub_x",
        status: "active",
        customer_id: "cus_1",
        product_id: "prod_pro",
      },
    });
    const res = await POST(signedRequest(body));
    const json = (await res.json()) as { handled?: boolean; note?: string };
    expect(json.handled).toBe(true);
    expect(json.note).toContain("revoked immediately");
    const patch = dbMock.updates.at(-1)!.patch;
    expect(patch.plan).toBe("free");
    expect(patch.dodoGraceUntil).toBeNull();
  });

  it("past_due keeps paid access using Dodo's own deadline", async () => {
    dbMock.users = [user({ plan: "pro" })];
    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const body = JSON.stringify({
      type: "subscription.past_due",
      data: {
        subscription_id: "sub_x",
        status: "past_due",
        customer_id: "cus_1",
        product_id: "prod_pro",
        past_due_ends_at: deadline.toISOString(),
      },
    });
    const res = await POST(signedRequest(body));
    const json = (await res.json()) as { handled?: boolean };
    expect(json.handled).toBe(true);
    const patch = dbMock.updates.at(-1)!.patch;
    expect(patch.dodoSubscriptionStatus).toBe("on_hold");
    expect((patch.dodoGraceUntil as Date).getTime()).toBeGreaterThanOrEqual(
      deadline.getTime() - 1000,
    );
  });

  it("records an unknown event type as a no-op 200 (no retry storm)", async () => {
    dbMock.users = [user()];
    const body = JSON.stringify({
      type: "payment.succeeded",
      data: { customer_id: "cus_1" },
    });
    const res = await POST(signedRequest(body));
    const json = (await res.json()) as { handled?: boolean };
    expect(res.status).toBe(200);
    expect(json.handled).toBe(false);
    expect(dbMock.updates).toHaveLength(0);
  });
});
