"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Disconnect a repo (Phase 2 task A): hard-deletes the connection, its
 * generation history, and takes its published docs offline. Exists so a user
 * at their plan's repo limit can swap a wrongly connected repo for another.
 */
export function DisconnectRepoButton({
  repoId,
  fullName,
  isHosted,
}: {
  repoId: string;
  fullName: string;
  isHosted: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function disconnect() {
    const warning = isHosted
      ? `Disconnect ${fullName}? Its published docs page goes offline immediately and its generation history is deleted. This frees a repo slot on your plan.`
      : `Disconnect ${fullName}? Its generation history is deleted and a repo slot on your plan is freed.`;
    if (!window.confirm(warning)) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/disconnect`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        setError(body.message ?? body.error ?? `Request failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex items-center justify-between gap-2 border-t border-zinc-800 pt-2">
      <button
        type="button"
        onClick={disconnect}
        disabled={busy}
        className="font-mono text-[11px] text-zinc-500 transition-colors hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Disconnecting…" : "Disconnect"}
      </button>
      {error ? <span className="font-mono text-[11px] text-red-400">{error}</span> : null}
    </div>
  );
}
