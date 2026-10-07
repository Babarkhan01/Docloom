/**
 * Account deletion (right to erasure — Privacy Policy §9, Terms §12 promise
 * self-serve deletion "through your account settings, or by contacting us").
 *
 * Order of operations (each step independently safe to fail/retry):
 *  1. Best-effort Dodo subscription cancel — the money relationship is the
 *     one thing DB cascades cannot undo. A no-show webhook is healed by the
 *     resync endpoint; a failed cancel is surfaced to the caller so the UI
 *     can tell the user to cancel from Dodo's portal instead of silently
 *     leaving a live subscription on a dead account.
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
      /** true when Dodo confirmed the cancel; false = best-effort skipped. */
      subscriptionCancelled: boolean;
      /** When the Dodo cancel failed: guidance for the user. */
      subscriptionNote: string | null;
    }
  | { ok: false; failedAt: DeletionStep; error: string };

export async function deleteAccount(
  store: DeleteAccountStore,
  dodo: DodoCancel | null,
  userId: string,
): Promise<DeleteAccountResult> {
  const subscriptionId = await store.findSubscriptionId(userId);

  let subscriptionCancelled = false;
  let subscriptionNote: string | null = null;
  if (subscriptionId && dodo) {
    try {
      await dodo.cancelSubscription(subscriptionId);
      subscriptionCancelled = true;
    } catch (err) {
      // Money handling is best-effort here, but never silent: the UI tells
      // the user exactly what to do, and Dodo's own portal still works.
      subscriptionNote =
        err instanceof Error
          ? `We couldn't cancel your Dodo subscription automatically (${err.message}). Please cancel it from your payment portal — no further charges occur after cancellation.`
          : "We couldn't cancel your subscription automatically. Please cancel it from your payment portal.";
    }
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
    return { ok: true, subscriptionCancelled, subscriptionNote };
  } catch (err) {
    return {
      ok: false,
      failedAt: "user_delete",
      error: err instanceof Error ? err.message : "database error",
    };
  }
}
