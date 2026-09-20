"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UpgradeButton } from "./upgrade-button";

/**
 * Per-repo auto-regenerate toggle (Phase 2). Starter/Team only: on a free
 * plan the switch is locked with the upgrade prompt instead of letting the
 * user flip it and hit a 403. The API re-checks the plan authoritatively.
 */
export function AutoRegenToggle({
  repoId,
  initial,
  plan,
}: {
  repoId: string;
  initial: boolean;
  plan: "free" | "starter" | "team";
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = plan === "free";

  async function setAutoRegenerate(next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/repos/${repoId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoRegenerate: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) {
        setError(body.message ?? body.error ?? `Request failed (${res.status})`);
        return;
      }
      setOn(next);
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-zinc-500">
          {locked ? "Auto-regenerate on merge" : "Auto-regenerate on merge"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Auto-regenerate on merge"
          disabled={busy || locked}
          onClick={() => setAutoRegenerate(!on)}
          className={`relative h-5 w-9 rounded-full transition-colors disabled:cursor-not-allowed ${
            on ? "bg-emerald-500/80" : "bg-zinc-700"
          } ${locked ? "opacity-40" : ""}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`}
          />
        </button>
      </div>
      {locked ? (
        <p className="flex items-center gap-2 text-right font-mono text-[11px] text-zinc-500">
          Starter feature — unlocks drafts on every merge
          <UpgradeButton />
        </p>
      ) : (
        <p className="max-w-xs text-right font-mono text-[11px] text-zinc-600">
          {on
            ? "Every push to the default branch drafts new docs for your approval."
            : "Off — docs only change when you regenerate manually."}
        </p>
      )}
      {error ? <p className="max-w-xs text-right font-mono text-[11px] text-red-400">{error}</p> : null}
    </div>
  );
}
