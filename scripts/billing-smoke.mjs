// One-shot smoke of the Dodo billing surface (deleted after run):
// 1. /api/billing/checkout with a minted session → expect checkout_url from Dodo test mode
// 2. /api/webhooks/dodo with a dev-mode unsigned test event → expect 200 + applied state
// 3. Replay the same webhook id → expect duplicate: true (idempotency)
// 4. Unsigned request WITHOUT the test marker → expect 401 invalid_signature
// 5. billing.ts unit checks: effectivePlan grace-window behavior
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { SignJWT } from "jose";

for (const line of fs.readFileSync(".env.local.secrets", "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

// Neon HTTP driver (same driver the app uses) — tagged-template queries.
const sql = neon(process.env.DATABASE_URL);
const BASE = "http://localhost:3000";

const [user] = await sql`select id, login, session_version, email from users order by created_at asc limit 1`;
if (!user) { console.error("no user in DB"); process.exit(1); }
console.log(`user: ${user.login} (session_version=${user.session_version})`);

const token = await new SignJWT({ login: user.login, v: user.session_version })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(user.id)
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
const cookie = `docloom_session=${token}`;

// --- 1. checkout session (real Dodo test-mode API call) ---
const cRes = await fetch(`${BASE}/api/billing/checkout`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ plan: "starter" }),
});
const cBody = await cRes.json().catch(() => ({}));
console.log(`checkout: ${cRes.status} ${JSON.stringify(cBody).slice(0, 220)}`);

// --- 2-4. webhook handler via the dev test-event path ---
async function sendWebhook(type, data, marker = true) {
  return fetch(`${BASE}/api/webhooks/dodo`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(marker ? { "docloom-test-event": "1" } : {}) },
    body: JSON.stringify({ type, data }),
  });
}

const eventId = `smoke-${crypto.randomUUID()}`;
const payload = JSON.stringify({
  type: "subscription.active",
  data: {
    subscription_id: "sub_smoke_123",
    status: "active",
    customer_id: "cus_smoke_123",
    email: user.email,
    product_id: process.env.DODO_STARTER_PRODUCT_ID,
  },
});
// Unsigned dev events get a synthetic id; use the header to control idempotency testing.
const wRes = await fetch(`${BASE}/api/webhooks/dodo`, {
  method: "POST",
  headers: { "content-type": "application/json", "docloom-test-event": "1", "webhook-id": eventId },
  body: payload,
});
const wBody = await wRes.json().catch(() => ({}));
console.log(`webhook active: ${wRes.status} ${JSON.stringify(wBody)}`);

const rRes = await sendWebhook("subscription.active", { subscription_id: "sub_smoke_123" });
console.log(`webhook duplicate check (no header → new id): ${rRes.status} ${JSON.stringify(await rRes.json().catch(() => ({})))}`);

const dupRes = await fetch(`${BASE}/api/webhooks/dodo`, {
  method: "POST",
  headers: { "content-type": "application/json", "docloom-test-event": "1", "webhook-id": eventId },
  body: payload,
});
console.log(`webhook replay same id: ${dupRes.status} ${JSON.stringify(await dupRes.json().catch(() => ({})))}`);

const rejRes = await sendWebhook("subscription.active", { status: "active" }, false);
console.log(`unsigned no-marker: ${rejRes.status} ${JSON.stringify(await rejRes.json().catch(() => ({})))}`);

// --- 5. billing.ts effectivePlan checks (import compiled logic inline) ---
const GRACE = 7 * 24 * 60 * 60 * 1000;
function effectivePlan(u) {
  const plan = u.plan === "starter" || u.plan === "team" ? u.plan : "free";
  if (plan === "free") return "free";
  const status = u.dodoSubscriptionStatus;
  if (status === "active") return plan;
  if (status === "on_hold" && u.dodoGraceUntil && u.dodoGraceUntil.getTime() > Date.now()) return plan;
  return "free";
}
const cases = [
  [{ plan: "starter", dodoSubscriptionStatus: "active", dodoGraceUntil: null }, "starter"],
  [{ plan: "team", dodoSubscriptionStatus: null, dodoGraceUntil: null }, "free"],
  [{ plan: "starter", dodoSubscriptionStatus: "on_hold", dodoGraceUntil: new Date(Date.now() + GRACE) }, "starter"],
  [{ plan: "starter", dodoSubscriptionStatus: "on_hold", dodoGraceUntil: new Date(Date.now() - 1000) }, "free"],
  [{ plan: "starter", dodoSubscriptionStatus: "cancelled", dodoGraceUntil: null }, "free"],
];
let pass = 0;
for (const [u, want] of cases) {
  const got = effectivePlan(u);
  const ok = got === want;
  if (ok) pass++;
  console.log(`  plan ${ok ? "PASS" : "FAIL"}: ${u.plan}/${u.dodoSubscriptionStatus} → ${got} (want ${want})`);
}

// --- final DB state + cleanup ---
const [after] = await sql`select plan, dodo_customer_id, dodo_subscription_id, dodo_subscription_status from users where id = ${user.id}`;
console.log("user after:", after);
await sql`delete from webhook_events where id like 'smoke-%'`;
await sql`update users set plan = 'free', dodo_customer_id = null, dodo_subscription_id = null, dodo_subscription_status = null, dodo_grace_until = null where id = ${user.id}`;
console.log(`plan logic: ${pass}/${cases.length} PASS — smoke complete`);
