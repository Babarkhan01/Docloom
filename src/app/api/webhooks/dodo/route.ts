import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, webhookEvents } from "@/lib/schema";
import { withRouteErrors } from "@/lib/route-wrapper";
import { getCustomerEmail } from "@/lib/dodo";

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
  /** Present on subscription.updated / cancelled payloads. */
  cancelled_at?: string;
};

type WebhookBody = {
  type?: string;
  data?: SubscriptionPayload;
};

/** Map a Dodo product id back to the Docloom plan it purchases. */
function planForProduct(productId: string | undefined): "starter" | "team" | null {
  if (!productId) return null;
  if (productId === process.env.DODO_STARTER_PRODUCT_ID) return "starter";
  if (productId === process.env.DODO_TEAM_PRODUCT_ID) return "team";
  return null;
}

async function applySubscriptionState(opts: {
  event: string;
  sub: SubscriptionPayload;
}): Promise<{ handled: boolean; note: string }> {
  const { event, sub } = opts;
  const status = sub.status;

  // Locate the user: prefer our stored customer_id mapping; otherwise resolve
  // the email from Dodo (events don't always carry it) and backfill the id.
  let userId: string | null = null;
  if (sub.customer_id) {
    const [byCustomer] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.dodoCustomerId, sub.customer_id))
      .limit(1);
    if (byCustomer) {
      userId = byCustomer.id;
    } else {
      const email = sub.email ?? (await getCustomerEmail(sub.customer_id));
      if (email) {
        const [byEmail] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);
        if (byEmail) {
          userId = byEmail.id;
          await db
            .update(users)
            .set({ dodoCustomerId: sub.customer_id, updatedAt: new Date() })
            .where(eq(users.id, byEmail.id));
        }
      }
    }
  }
  if (!userId) return { handled: false, note: "no matching user for event" };

  const graceUntil = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // PRD policy: 7-day grace

  switch (event) {
    case "subscription.active":
    case "subscription.renewed":
    case "subscription.updated": {
      if (status === "active") {
        const plan = planForProduct(sub.product_id);
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
        await db
          .update(users)
          .set({ dodoSubscriptionStatus: status, dodoGraceUntil: null, plan: "free", updatedAt: new Date() })
          .where(eq(users.id, userId));
        return { handled: true, note: `${status} — downgraded to free` };
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
      await db
        .update(users)
        .set({ dodoSubscriptionStatus: event === "subscription.cancelled" ? "cancelled" : "expired", dodoGraceUntil: null, plan: "free", updatedAt: new Date() })
        .where(eq(users.id, userId));
      return { handled: true, note: `${event} — downgraded to free` };
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
    console.error(`[dodo-webhook] processing failed for ${eventId}, will accept retry:`, err);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}

export const POST = withRouteErrors("POST /api/webhooks/dodo", webhookHandler);
