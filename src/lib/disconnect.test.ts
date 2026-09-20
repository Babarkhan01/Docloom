import { describe, expect, it } from "vitest";
import { disconnectRepo, type DisconnectStore } from "./disconnect";

function memoryStore(repos: { id: string; userId: string; fullName: string; isHosted: boolean }[]): {
  store: DisconnectStore;
  deleted: string[];
} {
  const deleted: string[] = [];
  return {
    deleted,
    store: {
      async findRepo(repoId, userId) {
        const r = repos.find((x) => x.id === repoId && x.userId === userId);
        return r ? { id: r.id, fullName: r.fullName, isHosted: r.isHosted } : null;
      },
      async deleteRepo(repoId) {
        deleted.push(repoId);
      },
    },
  };
}

describe("disconnectRepo", () => {
  it("hard-deletes the caller's repo and reports whether docs were hosted", async () => {
    const { store, deleted } = memoryStore([
      { id: "r1", userId: "u1", fullName: "o/keep", isHosted: false },
      { id: "r2", userId: "u1", fullName: "o/hosted", isHosted: true },
    ]);

    const res = await disconnectRepo(store, "r2", "u1");
    expect(res).toEqual({ ok: true, fullName: "o/hosted", isHosted: true });
    expect(deleted).toEqual(["r2"]);

    const other = await disconnectRepo(store, "r1", "u1");
    expect(other).toEqual({ ok: true, fullName: "o/keep", isHosted: false });
    expect(deleted).toEqual(["r2", "r1"]);
  });

  it("reads another user's repo as absent — no cross-user disconnects", async () => {
    const { store, deleted } = memoryStore([{ id: "r1", userId: "owner", fullName: "o/r", isHosted: false }]);

    const res = await disconnectRepo(store, "r1", "attacker");
    expect(res).toEqual({ ok: false, status: 404, error: "not_found" });
    expect(deleted).toEqual([]);
  });

  it("404s an unknown repo id", async () => {
    const { store, deleted } = memoryStore([]);
    const res = await disconnectRepo(store, "nope", "u1");
    expect(res).toEqual({ ok: false, status: 404, error: "not_found" });
    expect(deleted).toEqual([]);
  });
});
