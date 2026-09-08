import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedUser } from "@/lib/session";
import { appUrl } from "@/lib/env";
import { createCheckoutSession, dodoEnabled, type DodoPlan } from "@/lib/dodo";
import { withRouteErrors } from "@/lib/route-wrapper";
import { cleanupStaleBuckets, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PLANS: DodoPlan[] = ["starter", "team"];

/**
 * POST /api/billing/checkout { plan } — create a Dodo checkout session for the
 * signed-in user and return its hosted URL. The browser redirects to it; after
 * payment Dodo sends subscription.* webhooks which flip the user's plan.
 */
async function checkoutHandler(request: NextRequest) {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  cleanupStaleBuckets();
  const rl = rateLimit(`billing:checkout:${authorized.user.id}`, { max: 10 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 });
  }

  if (!dodoEnabled()) {
    return NextResponse.json(
      { error: "billing_unavailable", message: "Billing is not configured yet." },
      { status: 503 },
    );
  }

  let plan: unknown;
  try {
    ({ plan } = await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (typeof plan !== "string" || !PLANS.includes(plan as DodoPlan)) {
    return NextResponse.json(
      { error: "invalid_plan", message: `plan must be one of: ${PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  const { user } = authorized;
  const email = user.email ?? `${user.login}@users.noreply.github.com`;

  const session = await createCheckoutSession({
    plan: plan as DodoPlan,
    email,
    name: user.name ?? user.login,
    // Dodo sends the customer back here after payment/cancel; the webhook —
    // not this return — is what actually flips the plan.
    returnUrl: `${appUrl()}/dashboard?checkout=return`,
  });

  return NextResponse.json({ checkoutUrl: session.checkout_url, sessionId: session.session_id });
}

export const POST = withRouteErrors("POST /api/billing/checkout", checkoutHandler);
