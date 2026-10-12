import { describe, expect, it, vi } from "vitest";
import {
  deleteAccount,
  CANCEL_BLOCKED_USER_MESSAGE,
  type DeleteAccountStore,
  type DodoCancel,
} from "./delete-account";

function makeStore(userId: string) {
  const state = {
    sessionVersion: 0,
    deleted: false,
    subscriptionId: null as string | null,
  };
  const store: DeleteAccountStore = {
    async findSubscriptionId(id: string) {
      return id === userId ? state.subscriptionId : null;
    },
    async invalidateSessions(id) {
      if (id !== userId) throw new Error("cross-user write");
      state.sessionVersion += 1;
    },
    async deleteUser(id) {
      if (id !== userId) throw new Error("cross-user write");
      state.deleted = true;
    },
  };
  return { state, store };
}

describe("deleteAccount", () => {
  it("cancels the subscription, invalidates sessions, then deletes the user", async () => {
    const { state, store } = makeStore("u1");
    state.subscriptionId = "sub_123";
    const cancelCalls: string[] = [];
    const dodo: DodoCancel = {
      async cancelSubscription(subId) {
        cancelCalls.push(subId);
      },
    };

    const res = await deleteAccount(store, dodo, "u1");

    expect(res).toEqual({ ok: true, subscriptionCancelled: true });
    expect(cancelCalls).toEqual(["sub_123"]);
    expect(state.sessionVersion).toBe(1);
    expect(state.deleted).toBe(true);
  });

  it("without a subscription: no Dodo call, straight to delete", async () => {
    const { state, store } = makeStore("u1");
    const cancel = vi.fn();
    const res = await deleteAccount(store, { cancelSubscription: cancel }, "u1");

    expect(res).toEqual({ ok: true, subscriptionCancelled: false });
    expect(cancel).not.toHaveBeenCalled();
    expect(state.deleted).toBe(true);
  });

  it("a failed Dodo cancel ABORTS deletion — account and data untouched", async () => {
    const { state, store } = makeStore("u1");
    state.subscriptionId = "sub_123";
    const dodo: DodoCancel = {
      async cancelSubscription() {
        throw new Error("HTTP 502");
      },
    };

    const res = await deleteAccount(store, dodo, "u1");

    expect(res).toEqual({
      ok: false,
      failedAt: "subscription_cancel",
      error: CANCEL_BLOCKED_USER_MESSAGE,
    });
    // Nothing was deleted or invalidated — the account stays intact.
    expect(state.sessionVersion).toBe(0);
    expect(state.deleted).toBe(false);
  });

  it("the cancel-failure user message is fixed — it never embeds upstream error text", async () => {
    const { store } = makeStore("u1");
    const dodo: DodoCancel = {
      async cancelSubscription() {
        throw new Error("Bearer sk_live_SECRET_TOKEN rejected");
      },
    };

    const res = await deleteAccount(
      { ...store, findSubscriptionId: async () => "sub_123" },
      dodo,
      "u1",
    );

    // A leaking upstream message must not reach the result at all.
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe(CANCEL_BLOCKED_USER_MESSAGE);
    expect(res.ok === false && res.error.includes("sk_live")).toBe(false);
  });

  it("subscription present but billing disabled: refuses to delete a paying account", async () => {
    const { state, store } = makeStore("u1");
    state.subscriptionId = "sub_123";

    const res = await deleteAccount(store, null, "u1");

    expect(res).toEqual({
      ok: false,
      failedAt: "subscription_cancel",
      error: CANCEL_BLOCKED_USER_MESSAGE,
    });
    expect(state.deleted).toBe(false);
  });

  it("session invalidation failure aborts before user delete (fail-locked, not half-deleted)", async () => {
    const { state, store } = makeStore("u1");
    const failing: DeleteAccountStore = {
      ...store,
      async invalidateSessions() {
        throw new Error("db blip");
      },
    };

    const res = await deleteAccount(failing, null, "u1");

    expect(res).toEqual({ ok: false, failedAt: "session_invalidation", error: "db blip" });
    expect(state.deleted).toBe(false);
  });

  it("user delete failure reports user_delete step", async () => {
    const { store } = makeStore("u1");
    const failing: DeleteAccountStore = {
      ...store,
      async deleteUser() {
        throw new Error("fk constraint");
      },
    };

    const res = await deleteAccount(failing, null, "u1");

    expect(res).toEqual({ ok: false, failedAt: "user_delete", error: "fk constraint" });
  });
});
