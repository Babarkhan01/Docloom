import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, webhookEvents } from "@/lib/schema";
import { withRouteErrors } from "@/lib/route-wrapper";
import { dispatchAlert, configuredSinks } from "@/lib/alerts";
import { runAfterResponse } from "@/lib/wait-until";
import {
  getCustomerEmail,
  listCustomerSubscriptions,
  planForProduct,
  type DodoSubscriptionSummary,
} from "@/lib/dodo";

export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/dodo — Dodo Payments subscription lifecycle events.
 *
 * Security: Standard Webhooks spec HMAC verification over the raw body
 * (webhook-id . webhook-timestamp . payload), signed with DODO_WEBHOOK_SECRET.
 * Registration is deferred (public URL comes with the Cloudflare deploy), so
 * the handler verifies only when the secret is configured — in dev, without a
 * secret, it accepts unsigned events explicitly marked as test examples and
 * rejects everything else. When DODO_WEBHOOK_SECRET is set, unsigned requests
 * are always rejected.
 *
 * Idempotency: webhook_events PK insert (onConflictDoNothing) — Dodo retries
 * up to 8 times and may deliver duplicates; each event id applies at most once.
 *
 * Ordering: events may arrive out of order (per Dodo docs); handlers write
 * absolute states, never increments, so replay/ordering is safe.
 *
 * Cancellation edge case: a customer may hold several subscriptions (e.g. one
 * per plan while testing). A cancelled/expired event only downgrades the user
 * when no OTHER active subscription survives — so cancelling an old duplicate
 * never strips a plan the customer is still paying for.
 */

// Standard Webhooks allows multiple space-separated signatures (secret rotation).
function verifySignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  const msgId = headers.get("webhook-id") ?? "";
  const msgTs = headers.get("webhook-timestamp") ?? "";
  const sigHeader = headers.get("webhook-signature") ?? "";

  if (!secret) {
    // Dev only, before the endpoint is registered in Dodo's dashboard: accept
    // unsigned events explicitly marked as test sends. Production always has
    // DODO_WEBHOOK_SECRET set, so this path can never fire there.
    return process.env.NODE_ENV !== "production" && headers.get("docloom-test-event") === "1";
  }
  if (!msgId || !msgTs || !sigHeader) return false;

  // Replay guard: reject deliveries older than 5 minutes (Standard Webhooks).
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
  /** Plan reference carried by some Dodo event payloads. */
  plan_id?: string;
  /** Present on subscription.updated / cancelled payloads. */
  cancelled_at?: string;
  /**
   * Dodo payloads always carry the next scheduled billing — i.e. the END of
   * the current paid period. Used to keep paid access until the period a
   * customer already paid for actually ends, after a cancellation.
   */
  next_billing_date?: string;
  /**
   * Deadline of an open payment-failure grace window (subscription.past_due
   * payload). Falls back to the 7-day policy window when absent.
   */
  past_due_ends_at?: string;
};

type WebhookBody = {
  type?: string;
  data?: SubscriptionPayload;
};

/**
 * Keep-path for a cancelled sub that has live survivors: re-point the tracked
 * subscription at the best survivor and align the plan to it. Preference:
 * active Team > active Pro > any active > first live — mirroring the
 * resync endpoint's tier logic, so the user is never left below what an
 * active survivor pays for (cancelling a Pro test sub while a Team sub
 * is live lands back on team, never pro). Plan is set only from an
 * active survivor's mapped product; an unknown product keeps the current
 * plan. The row is only rewritten when it was tracking the cancelled sub.
 */
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

  // Locate the user: prefer our stored customer_id mapping; otherwise resolve
  // the email from Dodo (events don't always carry it) and backfill the id.
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

  const graceUntil = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // PRD policy: 7-day grace

  /**
   * Paid access until the end of the period the customer already paid for.
   * Read from the payload's next_billing_date when present; a payload without
   * it (or one whose date is already past) falls back to the 7-day grace —
   * conservative, never a longer-than-paid access window.
   */
  const paidUntilFromPeriodEnd = (): Date => {
    const raw = sub.next_billing_date ? new Date(sub.next_billing_date) : null;
    if (raw && !Number.isNaN(raw.getTime()) && raw.getTime() > Date.now()) return raw;
    return graceUntil();
  };

  switch (event) {
    case "subscription.active":
    case "subscription.renewed":
    case "subscription.updated": {
      if (status === "active") {
        const plan = planForProduct(sub.product_id, sub.plan_id);
        await db
          .update(users)
          .set({
            dodoSubscriptionId: sub.subscription_id ?? null,
            dodoSubscriptionStatus: "active",
            dodoGraceUntil: null,
            ...(plan ? { plan } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
        return { handled: true, note: `plan=${plan ?? "(kept)"} active` };
      }
      if (status === "on_hold") {
        await db
          .update(users)
          .set({ dodoSubscriptionStatus: "on_hold", dodoGraceUntil: graceUntil(), updatedAt: new Date() })
          .where(eq(users.id, userId));
        return { handled: true, note: "on_hold — 7-day grace started" };
      }
      if (status === "cancelled" || status === "expired") {
        // Cancellation arrives via subscription.updated (no dedicated event).
        // Only downgrade when no other live subscription survives — the
        // customer may hold several subs (one per plan, test duplicates, …).
        const liveSubs = await listCustomerSubscriptions(sub.customer_id ?? "");
        if (liveSubs === null) {
          // Dodo list unavailable — bail so the handler 500s, drops the
          // idempotency row, and Dodo's retries re-apply this cancel later.
          throw new Error("dodo_subscription_list_unavailable — cancel deferred to retry");
        }
        const survivors = liveSubs.filter((s) => s.subscription_id && s.subscription_id !== sub.subscription_id);
        if (survivors.length > 0) {
          const note = await keepBestSurvivor(userId, sub.subscription_id, survivors);
          return { handled: true, note: `${status} — ${note}` };
        }
        // Survivor check first, then the paid-period promise: the plan stays
        // honoured until the end of the period already paid for (Terms §7),
        // by borrowing dodoGraceUntil as the paid-through timestamp — plan
        // column untouched (it still says what the sub bought). An outdated
        // next_billing_date falls back to the 7-day grace — never longer
        // than what the customer actually bought.
        await db
          .update(users)
          .set({
            dodoSubscriptionStatus: "cancelled",
            dodoGraceUntil: paidUntilFromPeriodEnd(),
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
        return { handled: true, note: `${status} — plan kept until the paid period ends` };
      }
      return { handled: false, note: `subscription.updated with unhandled status ${status}` };
    }

    case "subscription.on_hold": {
      await db
        .update(users)
        .set({ dodoSubscriptionStatus: "on_hold", dodoGraceUntil: graceUntil(), updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { handled: true, note: "on_hold — 7-day grace started" };
    }

    case "subscription.failed": {
      // Terminal: mandate never created → never granted, plan stays/becomes free.
      await db
        .update(users)
        .set({ dodoSubscriptionStatus: "failed", dodoGraceUntil: null, plan: "free", updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { handled: true, note: "failed (terminal) — free" };
    }

    case "subscription.cancelled":
    case "subscription.expired": {
      // Same survivor check as the updated/cancelled path above.
      const liveSubs = await listCustomerSubscriptions(sub.customer_id ?? "");
      if (liveSubs === null) {
        // Dodo list unavailable — fail closed, let Dodo's retry re-apply.
        throw new Error("dodo_subscription_list_unavailable — cancel deferred to retry");
      }
      const survivors = liveSubs.filter((s) => s.subscription_id && s.subscription_id !== sub.subscription_id);
      if (survivors.length > 0) {
        const note = await keepBestSurvivor(userId, sub.subscription_id, survivors);
        return { handled: true, note: `${event} — ${note}` };
      }
      // Expired means end-of-term (Dodo itself decided it) — free immediately.
      if (event === "subscription.expired") {
        await db
          .update(users)
          .set({ dodoSubscriptionStatus: "expired", dodoGraceUntil: null, plan: "free", updatedAt: new Date() })
          .where(eq(users.id, userId));
        return { handled: true, note: "expired (term end) — downgraded to free" };
      }
      // Cancelled: keep the plan until the paid period ends (Terms §7) via
      // the same borrowed-grace mechanism as the subscription.updated path.
      await db
        .update(users)
        .set({ dodoSubscriptionStatus: "cancelled", dodoGraceUntil: paidUntilFromPeriodEnd(), updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { handled: true, note: "cancelled — plan kept until the paid period ends" };
    }

    case "subscription.past_due": {
      // Renewal failed but the grace period is open (past_due_ends_at in the
      // payload). Same semantics as on_hold, using Dodo's own deadline when
      // present. Refunds/chargebacks never arrive as past_due.
      const pdRaw = sub.past_due_ends_at ? new Date(sub.past_due_ends_at) : null;
      const deadline = pdRaw && !Number.isNaN(pdRaw.getTime()) && pdRaw.getTime() > Date.now() ? pdRaw : graceUntil();
      await db
        .update(users)
        .set({ dodoSubscriptionStatus: "on_hold", dodoGraceUntil: deadline, updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { handled: true, note: "past_due — paid access kept until the payload's grace deadline" };
    }

    /** Marked as refunded/chargeback — revoke paid access IMMEDIATELY. */
    case "refund.created":
    case "refund.succeeded":
    case "refund.processed":
    case "dispute.created":
    case "dispute.open":
    case "dispute.accepted":
    case "dispute.escalated":
    case "dispute.won_later": {
      await db
        .update(users)
        .set({
          dodoSubscriptionStatus: "cancelled",
          dodoGraceUntil: null,
          plan: "free",
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      return { handled: true, note: `${event} — refund/chargeback: plan revoked immediately, downgraded to free` };
    }

    default:
      // payment.succeeded / payment.failed etc. are informational here —
      // entitlement keys off subscription events per Dodo's recommendation.
      return { handled: false, note: "event type not actionable" };
  }
}

async function webhookHandler(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers)) {
    console.error("[dodo-webhook] delivery rejected: invalid signature");
    runAfterResponse(async () => {
      await dispatchAlert(
        {
          title: "Dodo webhook rejected: invalid signature",
          body: "A delivery to /api/webhooks/dodo failed HMAC verification — either the DODO_WEBHOOK_SECRET is misconfigured in the Dodo dashboard, or someone is posting forged events.",
          severity: "warning",
        },
        configuredSinks(),
      );
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
  // Idempotency gate: insert first; if the id already exists, Dodo re-delivered
  // an event we already applied — acknowledge without re-processing.
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: eventId, eventType: body.type ?? "unknown" })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    const result = await applySubscriptionState({
      event: body.type ?? "",
      sub: body.data ?? {},
    });
    console.log(`[dodo-webhook] ${body.type} (${eventId}): ${result.note}`);
    // Always 2xx: signature was valid, event is recorded — a handler bug must
    // not trigger Dodo's retry storm on a permanently-failing event.
    return NextResponse.json({ received: true, handled: result.handled, note: result.note });
  } catch (err) {
    // Processing failed (e.g. DB blip): remove the idempotency row so Dodo's
    // retry (exponential backoff, 8 attempts) can re-apply the event.
    await db.delete(webhookEvents).where(eq(webhookEvents.id, eventId));
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[dodo-webhook] processing failed for ${eventId}, will accept retry:`, err);
    runAfterResponse(async () => {
      await dispatchAlert(
        {
          title: `Dodo webhook processing failed (${body.type ?? "unknown"})`,
          body: `${message}\nevent ${eventId} — Dodo will retry; billing state may lag until it does.`,
          severity: "error",
        },
        configuredSinks(),
      );
    }).catch(() => {});
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

export const POST = withRouteErrors("POST /api/webhooks/dodo", webhookHandler);
