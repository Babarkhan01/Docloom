import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getAuthorizedUser } from "@/lib/session";
import { db } from "@/lib/db";
import { users, webhookEvents } from "@/lib/schema";
import { withRouteErrors } from "@/lib/route-wrapper";
import {
  dodoEnabled,
  isTerminalStatus,
  listCustomerSubscriptions,
  planForProduct,
  type DodoSubscriptionSummary,
} from "@/lib/dodo";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/resync — re-derive the signed-in user's entitlement from
 * Dodo's subscription list and write it to the DB.
 *
 * Self-heals missed webhooks (endpoint registered late, delivery lost, event
 * ordering gaps): the source of truth is Dodo's own API, and the write lands
 * on the caller's row only — nothing in the request body influences the
 * result. Returns the resulting row state so the caller can confirm exactly
 * what the DB now says.
 */
async function resyncHandler(): Promise<NextResponse> {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { user } = authorized;

  if (!dodoEnabled()) {
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
  if (!user.dodoCustomerId) {
    return NextResponse.json({
      resynced: false,
      reason: "no_dodo_customer_linked",
      plan: user.plan,
      dodoSubscriptionStatus: user.dodoSubscriptionStatus,
    });
  }

  const subs = await listCustomerSubscriptions(user.dodoCustomerId);
  if (subs === null) {
    // Fail closed: unknown Dodo state must never change the row.
    return NextResponse.json({ error: "dodo_unavailable" }, { status: 503 });
  }

  const live = subs.filter((s) => s.subscription_id && !isTerminalStatus(s.status));
  const activePlan = (s: DodoSubscriptionSummary) =>
    s.status === "active" ? planForProduct(s.product_id, s.plan_id) : null;

  // Highest tier wins so a live sub never leaves the user below what they pay
  // for; among same-tier actives Dodo's list order decides (acceptable —
  // duplicates are a test artifact, and the webhook/re-sync keeps healing).
  const best =
    live.find((s) => activePlan(s) === "team") ??
    live.find((s) => activePlan(s) === "starter") ??
    live.find((s) => s.status === "active") ??
    null;

  if (best) {
    await db
      .update(users)
      .set({
        // Unknown product id: keep the current plan rather than guess downward.
        plan: activePlan(best) ?? user.plan,
        dodoSubscriptionId: best.subscription_id ?? null,
        dodoSubscriptionStatus: "active",
        dodoGraceUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  } else {
    // Nothing active. on_hold keeps the plan with a fresh grace window;
    // otherwise downgrade to free, keeping the last known terminal status.
    const onHold = live.find((s) => s.status === "on_hold");
    const lastKnown = subs.find((s) => s.subscription_id);
    await db
      .update(users)
      .set({
        plan: onHold ? user.plan : "free",
        dodoSubscriptionId: null,
        dodoSubscriptionStatus: onHold ? "on_hold" : (lastKnown?.status ?? null),
        dodoGraceUntil: onHold ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  // Read the row back so the response reflects DB truth, not intent.
  const [row] = await db
    .select({
      plan: users.plan,
      dodoSubscriptionId: users.dodoSubscriptionId,
      dodoSubscriptionStatus: users.dodoSubscriptionStatus,
      dodoGraceUntil: users.dodoGraceUntil,
    })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  // Observability: a resync call doubles as a billing health check. Echo what
  // Dodo currently reports per subscription (with THIS deployment's plan
  // mapping applied — proves the product-id env vars resolve here) plus the
  // most recent processed webhook events (types + timestamps only, no ids —
  // enough to confirm deliveries without exposing identifiers).
  const recentEvents = await db
    .select({ eventType: webhookEvents.eventType, receivedAt: webhookEvents.receivedAt })
    .from(webhookEvents)
    .orderBy(desc(webhookEvents.receivedAt))
    .limit(5);

  return NextResponse.json({
    resynced: true,
    ...row,
    dodoLiveSubs: subs.map((s) => ({
      subscriptionId: s.subscription_id,
      status: s.status,
      plan: planForProduct(s.product_id, s.plan_id),
    })),
    recentWebhookEvents: recentEvents,
  });
}

export const POST = withRouteErrors("POST /api/billing/resync", resyncHandler);
