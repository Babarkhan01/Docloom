import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, webhookEvents } from "@/lib/schema";
import { withRouteErrors } from "@/lib/route-wrapper";
import { dispatchAlert, configuredSinks } from "@/lib/alerts";
import { runAfterResponse } from "@/lib/wait-until";
import { getCustomerEmail, isTerminalStatus, listCustomerSubscriptions, planForProduct, type DodoSubscriptionSummary, } from "@/lib/dodo";

export const dynamic = "force-dynamic";

function verifySignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  const msgId = headers.get("webhook-id") ?? "";
  const msgTs = headers.get("webhook-timestamp") ?? "";
  const sigHeader = headers.get("webhook-signature") ?? "";

  if (!secret) {
    return process.env.NODE_ENV !== "production" && headers.get("docloom-test-event") === "1";
  }
  if (!msgId || !msgTs || !sigHeader) return false;

  const ts = Number(msgTs);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const secretBytes = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
  const expected = createHmac("sha256", secretBytes).update(`${msgId}.${msgTs}.${rawBody}`).digest("base64");

  return sigHeader.split(" ").some(
    (sig) =>
      sig.startsWith("v1,") &&
      safeEqual(Buffer.from(sig.slice(3)), Buffer.from(expected)),
  );
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

type SubscriptionPayload = {
  subscription_id?: string;
  status?: string;
  customer_id?: string;
  email?: string;
  product_id?: string;
  plan_id?: string;
  cancelled_at?: string;
  next_billing_date?: string;
  past_due_ends_at?: string;
  payment_id?: string;
};

type WebhookBody = { type?: string; data?: SubscriptionPayload };

async function keepBestSurvivor(
  userId: string,
  cancelledSubId: string | undefined,
  survivors: DodoSubscriptionSummary[],
): Promise<string> {
  const tier = (s: DodoSubscriptionSummary) =>
    s.status === "active" ? planForProduct(s.product_id, s.plan_id) : null;
  const best =
    survivors.find((s) => tier(s) === "team") ??
    survivors.find((s) => tier(s) === "pro") ??
    survivors.find((s) => s.status === "active") ??
    survivors[0];
  const plan = best ? tier(best) : null;
  await db
    .update(users)
    .set({
      dodoSubscriptionId: best?.subscription_id ?? null,
      dodoSubscriptionStatus: best?.status ?? "active",
      dodoGraceUntil: null,
      ...(plan ? { plan } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(users.id, userId), eq(users.dodoSubscriptionId, cancelledSubId ?? "")));
  return `kept plan (tracking ${best?.subscription_id ?? "?"}${plan ? `, plan=${plan}` : ""})`;
}

async function applySubscriptionState(opts: {
  event: string;
  sub: SubscriptionPayload;
}): Promise<{ handled: boolean; note: string }> {
  const { event, sub } = opts;
  const status = sub.status;

  let userRow: { id: string } | null = null;
  if (sub.customer_id) {
    const [byCustomer] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.dodoCustomerId, sub.customer_id))
      .limit(1);
    if (byCustomer) {
      userRow = byCustomer;
    } else {
      const email = sub.email ?? (await getCustomerEmail(sub.customer_id));
      if (email) {
        const [byEmail] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (byEmail) {
          userRow = byEmail;
          await db
            .update(users)
            .set({ dodoCustomerId: sub.customer_id, updatedAt: new Date() })
            .where(eq(users.id, byEmail.id));
        }
      }
    }
  }
  if (!userRow) return { handled: false, note: "no matching user for event" };
  const userId = userRow.id;

  const graceUntil = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const maskCustomerIdStr = (value?: string) =>
    value ? `${value[0]}.${value[value.length - 1]}` : "(no-customer-id)";

  const maskString = (value?: string) =>
    value ? `${value.slice(0, 3)}…${value.slice(-2)}` : "(no-id)";

  const noteWithCustomer = (event: string) =>
    `${event} (customerId=${maskCustomerIdStr(sub.customer_id)})`;

  function dispatchAfterResponse(alert: { title: string; body: string; severity: "warning" }): void {
    runAfterResponse(async () => {
      await dispatchAlert(alert, configuredSinks()).catch(() => {});
    }).catch(() => {});
  }

  async function revokeForCustomer(customerId: string): Promise<void> {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.dodoCustomerId, customerId));
    const ids = rows.map((r) => r.id);
    for (const id of ids) {
      await db
        .update(users)
        .set({ dodoSubscriptionStatus: "cancelled", dodoGraceUntil: null, plan: "free", updatedAt: new Date() })
        .where(eq(users.id, id));
    }
  }

  async function recomputeForCustomer(customerId: string): Promise<boolean> {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.dodoCustomerId, customerId));
    const ids = rows.map((r) => r.id);
    const subs = await listCustomerSubscriptions(customerId);
    if (subs === null) throw new Error("dodo_subscription_list_unavailable — defer to retry");
    const survivors = subs.filter((s) => s.subscription_id && !isTerminalStatus(s.status));
    if (survivors.length === 0) return false;
    const tier = (s: DodoSubscriptionSummary) => s.status === "active" ? planForProduct(s.product_id, s.plan_id) : null;
    const best =
      survivors.find((s) => tier(s) === "team") ??
      survivors.find((s) => tier(s) === "pro") ??
      survivors.find((s) => s.status === "active");
    if (!best) return false;
    const plan = tier(best);
    for (const id of ids) {
      await db
        .update(users)
        .set({
          dodoSubscriptionId: best.subscription_id ?? null,
          dodoSubscriptionStatus: best.status === "active" ? "active" : "on_hold",
          dodoGraceUntil: null,
          ...(plan ? { plan } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id));
    }
    return true;
  }

  switch (event) {
    case "subscription.active":
    case "subscription.renewed":
    case "subscription.updated": {
      if (status === "active") {
        const plan = planForProduct(sub.product_id, sub.plan_id);
        await db
          .update(users)
          .set({ dodoSubscriptionId: sub.subscription_id ?? null, dodoSubscriptionStatus: "active", dodoGraceUntil: null, ...(plan ? { plan } : {}), updatedAt: new Date() })
          .where(eq(users.id, userId));
        return { handled: true, note: `plan=${plan ?? "(kept)"} active` };
      }
      if (status === "on_hold") {
        await db.update(users).set({ dodoSubscriptionStatus: "on_hold", dodoGraceUntil: graceUntil(), updatedAt: new Date() }).where(eq(users.id, userId));
        return { handled: true, note: "on_hold — 7-day grace started" };
      }
      if (status === "cancelled" || status === "expired") {
        const liveSubs = await listCustomerSubscriptions(sub.customer_id ?? "");
        if (liveSubs === null) throw new Error("dodo_subscription_list_unavailable — cancel deferred to retry");
        const survivors = liveSubs.filter((s) => s.subscription_id && s.subscription_id !== sub.subscription_id);
        if (survivors.length > 0) {
          const note = await keepBestSurvivor(userId, sub.subscription_id, survivors);
          return { handled: true, note: `${status} — ${note}` };
        }
        if (status === "expired") {
          await db.update(users).set({ dodoSubscriptionStatus: "expired", dodoGraceUntil: null, plan: "free", updatedAt: new Date() }).where(eq(users.id, userId));
          return { handled: true, note: "expired (term end) — downgraded to free" };
        }
        await db.update(users).set({ dodoSubscriptionStatus: "cancelled", dodoGraceUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), updatedAt: new Date() }).where(eq(users.id, userId));
        return { handled: true, note: "cancelled — plan kept until the paid period ends" };
      }
      return { handled: false, note: `subscription.updated with unhandled status ${status}` };
    }
    case "subscription.on_hold": {
      await db.update(users).set({ dodoSubscriptionStatus: "on_hold", dodoGraceUntil: graceUntil(), updatedAt: new Date() }).where(eq(users.id, userId));
      return { handled: true, note: "on_hold — 7-day grace started" };
    }
    case "subscription.failed": {
      await db.update(users).set({ dodoSubscriptionStatus: "failed", dodoGraceUntil: null, plan: "free", updatedAt: new Date() }).where(eq(users.id, userId));
      return { handled: true, note: `subscription.failed (customerId=${maskCustomerIdStr(sub.customer_id)}): terminal — downgraded to free` };
    }
    case "payment.succeeded": {
      return { handled: false, note: "event type not actionable" };
    }
    case "refund.failed": {
      return { handled: true, note: noteWithCustomer(event) + ": logged, no entitlement change" };
    }
    case "refund.succeeded": {
      await revokeForCustomer(sub.customer_id ?? "");
      dispatchAfterResponse({
        title: `Dodo: refund.succeeded (subscription NOT cancelled)`,
        body: `event=refund.succeeded; customer.customer_id=${maskCustomerIdStr(sub.customer_id ?? "")}${sub.payment_id ? `; payment_id=${maskString(sub.payment_id)}` : ""}; refund does not cancel the subscription — cancel it in Dodo if the customer should stop being billed`,
        severity: "warning",
      });
      return { handled: true, note: noteWithCustomer(event) + "; plan revoked for all tied Docloom accounts; refund does not cancel the subscription — cancel it in Dodo if the customer should stop being billed" };
    }
    case "dispute.opened":
    case "dispute.lost": {
      await revokeForCustomer(sub.customer_id ?? "");
      dispatchAfterResponse({
        title: `Dodo: ${event} — access revoked`,
        body: `event=${event}; customer.customer_id=${maskCustomerIdStr(sub.customer_id ?? "")}${sub.payment_id ? `; payment_id=${maskString(sub.payment_id)}` : ""}`,
        severity: "warning",
      });
      return { handled: true, note: noteWithCustomer(event) + ": access revoked for all tied Docloom accounts" };
    }
    case "dispute.won":
    case "dispute.cancelled": {
      const revived = await recomputeForCustomer(sub.customer_id ?? "");
      dispatchAfterResponse({
        title: `Dodo: ${event} — ${revived ? "access restored" : "no active sub to restore"}`,
        body: `event=${event}; customer.customer_id=${maskCustomerIdStr(sub.customer_id ?? "")}${sub.payment_id ? `; payment_id=${maskString(sub.payment_id)}` : ""}`,
        severity: "warning",
      });
      if (!revived) return { handled: true, note: noteWithCustomer(event) + ": no active subscription to restore" };
      return { handled: true, note: noteWithCustomer(event) + ": plan restored from surviving subscription" };
    }
    case "dispute.challenged":
    case "dispute.accepted":
    case "dispute.expired": {
      return { handled: true, note: noteWithCustomer(event) + ": logged, no entitlement change" };
    }
    case "subscription.plan_changed": {
      const plan = planForProduct(sub.product_id, sub.plan_id);
      await db.update(users).set({ dodoSubscriptionId: sub.subscription_id ?? null, ...(plan ? { plan } : {}), updatedAt: new Date() }).where(eq(users.id, userId));
      return { handled: true, note: noteWithCustomer(event) + `: plan recomputed to ${plan ?? "(kept)"}` };
    }
    default:
      return { handled: false, note: "event type not actionable" };
  }
}

async function webhookHandler(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers)) {
    console.error("[dodo-webhook] delivery rejected: invalid signature");
    runAfterResponse(async () => {
      await dispatchAlert({
        title: "Dodo webhook rejected: invalid signature",
        body: "A delivery to /api/webhooks/dodo failed HMAC verification — either the DODO_WEBHOOK_SECRET is misconfigured in the Dodo dashboard, or someone is posting forged events.",
        severity: "warning",
      }, configuredSinks());
    }).catch(() => {});
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventId = request.headers.get("webhook-id") ?? `test-${crypto.randomUUID()}`;
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: eventId, eventType: body.type ?? "unknown" })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const result = await applySubscriptionState({ event: body.type ?? "", sub: body.data ?? {} });
    console.log(`[dodo-webhook] ${body.type} (${eventId}): ${result.note}`);
    return NextResponse.json({ received: true, handled: result.handled, note: result.note });
  } catch (err) {
    await db.delete(webhookEvents).where(eq(webhookEvents.id, eventId));
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dodo-webhook] processing failed for ${eventId}, will accept retry:`, err);
    runAfterResponse(async () => {
      await dispatchAlert({
        title: `Dodo webhook processing failed (${body.type ?? "unknown"})`,
        body: `${message}\nevent ${eventId} — Dodo will retry; billing state may lag until it does.`,
        severity: "error",
      }, configuredSinks());
    }).catch(() => {});
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

export const POST = withRouteErrors("POST /api/webhooks/dodo", webhookHandler);
