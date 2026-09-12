import { getEnv } from "./env";
import { loadEnvFileSecrets } from "./env-file";
import type { Plan } from "./billing";

/**
 * Minimal Dodo Payments REST client — only the two calls the PRD needs:
 * checkout-session creation (Upgrade button) and a customer lookup used by the
 * webhook handler to backfill dodo_customer_id. Uses the official base URLs:
 * test mode → https://test.dodopayments.com, live → https://live.dodopayments.com.
 *
 * Note: the webhook endpoint does NOT use this module — verification there is
 * pure HMAC (Standard Webhooks spec) and must work even when the API is down.
 */

loadEnvFileSecrets();

const TEST_BASE = "https://test.dodopayments.com";
const LIVE_BASE = "https://live.dodopayments.com";

export type DodoPlan = Extract<Plan, "starter" | "team">;

function apiBase(): string {
  const mode = process.env.DODO_MODE === "live" ? "live" : "test";
  return mode === "live" ? LIVE_BASE : TEST_BASE;
}

/**
 * Billing is live when an API key and product ids are configured. DODO_MODE
 * selects the API base (test vs live); both modes are valid once configured.
 */
export function dodoEnabled(): boolean {
  return Boolean(process.env.DODO_API_KEY && process.env.DODO_STARTER_PRODUCT_ID && process.env.DODO_TEAM_PRODUCT_ID);
}

export type CheckoutSession = {
  session_id: string;
  checkout_url: string;
};

/**
 * Create a subscription checkout session for one plan.
 * Docs: POST /checkouts with product_cart + customer + return_url → { checkout_url }.
 */
export async function createCheckoutSession(opts: {
  plan: DodoPlan;
  email: string;
  name: string;
  returnUrl: string;
}): Promise<CheckoutSession> {
  const productId = getEnv(opts.plan === "starter" ? "DODO_STARTER_PRODUCT_ID" : "DODO_TEAM_PRODUCT_ID");

  const res = await fetch(`${apiBase()}/checkouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getEnv("DODO_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: opts.email, name: opts.name },
      return_url: opts.returnUrl,
      // Link checkouts back to the Docloom user for webhook correlation.
      metadata: { integration_tag: "docloom-app" },
    }),
    // Checkout creation is on the hot path of the Upgrade button.
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Dodo checkout creation failed: HTTP ${res.status} ${body.slice(0, 300)}`);
    throw new Error(`Dodo checkout creation failed (HTTP ${res.status})`);
  }

  const data = (await res.json()) as { session_id?: string; checkout_url?: string };
  if (!data.checkout_url) throw new Error("Dodo checkout response missing checkout_url");
  return { session_id: data.session_id ?? "", checkout_url: data.checkout_url };
}

/**
 * Fetch a Dodo customer's email by id. Webhook fallback: subscription events
 * always carry customer_id but not always an email — when our DB has no
 * customer_id mapping yet, we resolve the email this way to find the user.
 * Returns null when not found or the API is unreachable.
 */
export async function getCustomerEmail(customerId: string): Promise<string | null> {
  const res = await fetch(`${apiBase()}/customers/${encodeURIComponent(customerId)}`, {
    headers: { Authorization: `Bearer ${getEnv("DODO_API_KEY")}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error(`Dodo customer fetch failed: HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as { email?: string };
  return data.email ?? null;
}

/** Terminal subscription statuses — a cancelled/expired/failed sub grants nothing. */
export function isTerminalStatus(status: string | undefined): boolean {
  return status === "cancelled" || status === "expired" || status === "failed";
}

/**
 * Map a Dodo product/plan id to the Docloom plan it purchases. Shared by the
 * webhook handler and the resync endpoint. Falls back to the plan_id since
 * both reference the product/plan configured in the Dodo dashboard. Returns
 * null for unknown products.
 */
export function planForProduct(
  productId: string | undefined,
  planId: string | undefined,
): "starter" | "team" | null {
  for (const id of [productId, planId]) {
    if (!id) continue;
    if (id === process.env.DODO_STARTER_PRODUCT_ID) return "starter";
    if (id === process.env.DODO_TEAM_PRODUCT_ID) return "team";
  }
  return null;
}

export type DodoSubscriptionSummary = {
  subscription_id: string | undefined;
  status: string | undefined;
  product_id: string | undefined;
  plan_id: string | undefined;
};

/**
 * List a Dodo customer's subscriptions (all statuses, first page of 100 —
 * far beyond any real customer's count). Returns null when the API is
 * unreachable or errors — callers must treat null as "unknown" and fail
 * closed: never strip paid access because Dodo could not answer.
 */
export async function listCustomerSubscriptions(
  customerId: string,
): Promise<DodoSubscriptionSummary[] | null> {
  try {
    const res = await fetch(`${apiBase()}/subscriptions?limit=100`, {
      headers: { Authorization: `Bearer ${getEnv("DODO_API_KEY")}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`Dodo subscription list failed: HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as {
      items?: Array<{
        subscription_id?: string;
        status?: string;
        product_id?: string;
        plan_id?: string;
        customer?: { customer_id?: string };
      }>;
    };
    return (data.items ?? [])
      .filter((s) => s.customer?.customer_id === customerId)
      .map((s) => ({
        subscription_id: s.subscription_id,
        status: s.status,
        product_id: s.product_id,
        plan_id: s.plan_id,
      }));
  } catch (err) {
    console.error("Dodo subscription list failed:", err);
    return null;
  }
}
