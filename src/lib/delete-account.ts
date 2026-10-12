/**
 * Account deletion (right to erasure — Privacy Policy §9, Terms §12 promise
 * self-serve deletion "through your account settings, or by contacting us").
 *
 * Order of operations (each step independently safe to fail/retry):
 *  1. Dodo subscription cancel — REQUIRED, not best-effort. The money
 *     relationship is the one thing DB cascades cannot undo: deleting the
 *     account below would orphan a live subscription that keeps billing a
 *     person we can no longer reach. If the cancel fails, deletion aborts
 *     (data untouched, account usable), the user gets a clear retry-after-
 *     portal message, and the route alerts ops.
 *  2. Bump session_version — every issued session token is rejected
 *     server-side immediately; the account is inert from this moment.
 *  3. Delete the users row. FKs are ON DELETE CASCADE from users →
 *     repos → generations, so one delete removes repos, generation history,
 *     drafts, and published docs (docs pages stop resolving the moment the
 *     user row is gone — the subdomain lookup joins users).
 *  4. Clear the cookie (route's job) so no dead session lingers in the browser.
 *
 * usage_counters / webhook_events have no userId-bearing leftovers to clean
 * beyond the cascade (usage_counters.user_id is a cascade FK; webhook_events
 * rows are billing audit records keyed by event id, not by user, and Dodo's
 * own retention governs billing records — same carve-out the privacy policy
 * already states for Dodo).
 */

export type DeletionStep =
  | "subscription_cancel"
  | "subscription_cancel_failed"
  | "session_invalidation"
  | "user_delete";

export type DeleteAccountStore = {
  /** The user's live Dodo subscription id, when one exists. */
  findSubscriptionId(userId: string): Promise<string | null>;
  /** Bump session_version so all issued tokens die server-side. */
  invalidateSessions(userId: string): Promise<void>;
  /** Delete the users row — repos/generations/usage cascade via FK. */
  deleteUser(userId: string): Promise<void>;
};

export type DodoCancel = {
  /** Try to cancel the subscription via Dodo's API. */
  cancelSubscription(subscriptionId: string): Promise<void>;
};

export type DeleteAccountResult =
  | {
      ok: true;
      /** true when the user had a subscription and Dodo confirmed the cancel. */
      subscriptionCancelled: boolean;
    }
  | { ok: false; failedAt: DeletionStep; error: string };

/** Fixed, safe user-facing message for a failed cancel — never interpolated
 *  with raw upstream error text, which could carry provider boilerplate. */
export const CANCEL_BLOCKED_USER_MESSAGE =
  "We couldn't cancel your subscription before deleting your account, so deletion " +
  "was stopped — your data is untouched. Please cancel the subscription from your " +
  "payment portal (Dodo Payments), then delete your account again from here.";

export async function deleteAccount(
  store: DeleteAccountStore,
  dodo: DodoCancel | null,
  userId: string,
): Promise<DeleteAccountResult> {
  const subscriptionId = await store.findSubscriptionId(userId);

  let subscriptionCancelled = false;
  if (subscriptionId && dodo) {
    try {
      await dodo.cancelSubscription(subscriptionId);
      subscriptionCancelled = true;
    } catch (err) {
      // Abort: never delete data while a subscription might still bill.
      // The error surface to the user is the fixed, safe message; the raw
      // error identity is only for ops (the route logs+alerts it).
      console.error(`[delete-account] Dodo cancel failed for ${userId}:`, err);
      return {
        ok: false,
        failedAt: "subscription_cancel",
        error: CANCEL_BLOCKED_USER_MESSAGE,
      };
    }
  } else if (subscriptionId && !dodo) {
    // Billing disabled mid-flight (envs removed): refuse to delete a paying
    // account we can no longer cancel. Same conservative abort.
    return {
      ok: false,
      failedAt: "subscription_cancel",
      error: CANCEL_BLOCKED_USER_MESSAGE,
    };
  }

  try {
    // Invalidate sessions FIRST: if the user delete below fails mid-way,
    // the account is still locked rather than half-deleted and usable.
    await store.invalidateSessions(userId);
  } catch (err) {
    return {
      ok: false,
      failedAt: "session_invalidation",
      error: err instanceof Error ? err.message : "database error",
    };
  }

  try {
    await store.deleteUser(userId);
    return { ok: true, subscriptionCancelled };
  } catch (err) {
    return {
      ok: false,
      failedAt: "user_delete",
      error: err instanceof Error ? err.message : "database error",
    };
  }
}
