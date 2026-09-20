/**
 * Repo disconnect (Phase 2 task A): lets a user — typically a free-plan user
 * with the single-repo limit — swap a wrongly connected repo for another.
 *
 * Semantics (chosen in Phase 0 planning): hard delete. The repos row is
 * deleted; generations cascade via FK; the docs subdomain is freed and its
 * public page stops resolving. The freed slot makes the repo-count gate pass
 * immediately — the gate counts connected repos (rows), and there is one row
 * fewer. The UI warns before disconnecting a repo with published docs.
 */

export type DisconnectStore = {
  /** Owner-scoped lookup — a repo belonging to someone else must read as absent. */
  findRepo(
    repoId: string,
    userId: string,
  ): Promise<{ id: string; fullName: string; isHosted: boolean } | null>;
  deleteRepo(repoId: string): Promise<void>;
};

export type DisconnectResult =
  | { ok: true; fullName: string; isHosted: boolean }
  | { ok: false; status: 404; error: "not_found" };

export async function disconnectRepo(
  store: DisconnectStore,
  repoId: string,
  userId: string,
): Promise<DisconnectResult> {
  const repo = await store.findRepo(repoId, userId);
  if (!repo) return { ok: false, status: 404, error: "not_found" };

  await store.deleteRepo(repoId);
  return { ok: true, fullName: repo.fullName, isHosted: repo.isHosted };
}
