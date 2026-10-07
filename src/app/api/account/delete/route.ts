import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { getAuthorizedUser, SESSION_COOKIE } from "@/lib/session";
import { withRouteErrors } from "@/lib/route-wrapper";
import { deleteAccount } from "@/lib/delete-account";
import { cancelSubscription, dodoEnabled } from "@/lib/dodo";
import { dispatchAlert, configuredSinks } from "@/lib/alerts";
import { runAfterResponse } from "@/lib/wait-until";
import { track } from "@/lib/analytics";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/account/delete — self-serve account deletion (Privacy Policy §9:
 * "You may delete your account at any time through your account settings").
 *
 * Flow: rate-limited, authenticated; best-effort Dodo subscription cancel →
 * session invalidation (all tokens die server-side) → users row delete.
 * repos/generations/usage_counters cascade via FK, so published docs pages
 * stop resolving with the user row. The browser cookie is cleared here.
 */
async function deleteAccountHandler(request: NextRequest) {
  const authorized = await getAuthorizedUser();
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const limit = rateLimit(`account-delete:${clientIp(request)}`, { max: 3, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts — try again in a minute." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const userId = authorized.user.id;

  const result = await deleteAccount(
    {
      async findSubscriptionId(id) {
        const [row] = await db
          .select({ subId: users.dodoSubscriptionId })
          .from(users)
          .where(eq(users.id, id))
          .limit(1);
        return row?.subId ?? null;
      },
      async invalidateSessions(id) {
        await db
          .update(users)
          .set({
            sessionVersion: sql`${users.sessionVersion} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id));
      },
      async deleteUser(id) {
        await db.delete(users).where(eq(users.id, id));
      },
    },
    dodoEnabled() ? { cancelSubscription } : null,
    userId,
  );

  if (!result.ok) {
    console.error(`[account-delete] failed at ${result.failedAt} for user ${userId}:`, result.error);
    runAfterResponse(async () => {
      await dispatchAlert(
        {
          title: `Account deletion failed (${result.failedAt})`,
          body: `user ${userId}: ${result.error}`,
          severity: "error",
        },
        configuredSinks(),
      );
    }).catch(() => {});
    return NextResponse.json(
      { error: "deletion_failed", message: "Deletion failed — please try again or contact support." },
      { status: 500 },
    );
  }

  track(userId, "account_deleted", { subscriptionCancelled: result.subscriptionCancelled });

  if (result.subscriptionNote) {
    // The account is gone but a live subscription may remain — make sure the
    // operator knows, since the user has no dashboard to see this in.
    runAfterResponse(async () => {
      await dispatchAlert(
        {
          title: "Account deleted with un-cancelled Dodo subscription",
          body: `user ${userId}: ${result.subscriptionNote}`,
          severity: "warning",
        },
        configuredSinks(),
      );
    }).catch(() => {});
  }

  const response = NextResponse.json({
    deleted: true,
    subscriptionCancelled: result.subscriptionCancelled,
    subscriptionNote: result.subscriptionNote,
  });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return response;
}

export const POST = withRouteErrors("POST /api/account/delete", deleteAccountHandler);
