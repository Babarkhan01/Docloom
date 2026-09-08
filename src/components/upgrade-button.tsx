"use client";

import { useState } from "react";

/**
 * Upgrade button → POST /api/billing/checkout → redirect to Dodo's hosted
 * checkout. Plan actually flips via Dodo webhooks after payment, not here.
 */
export function UpgradeButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"starter" | "team" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(plan: "starter" | "team") {
    setLoading(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { checkoutUrl?: string; message?: string; error?: string };
      if (res.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setError(data.message ?? data.error ?? "Could not start checkout");
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:border-zinc-600 hover:text-white"
      >
        Upgrade
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-64 rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-xl">
          <p className="mb-2 font-mono text-xs text-zinc-500">choose a plan</p>
          <button
            type="button"
            onClick={() => upgrade("starter")}
            disabled={loading !== null}
            className="w-full rounded-md border border-zinc-800 px-3 py-2 text-left text-sm transition-colors hover:border-zinc-600 disabled:opacity-50"
          >
            <span className="font-medium">Starter — $19/mo</span>
            <span className="block text-xs text-zinc-500">25 generations / day</span>
          </button>
          <button
            type="button"
            onClick={() => upgrade("team")}
            disabled={loading !== null}
            className="mt-2 w-full rounded-md border border-zinc-800 px-3 py-2 text-left text-sm transition-colors hover:border-zinc-600 disabled:opacity-50"
          >
            <span className="font-medium">Team — $49/mo</span>
            <span className="block text-xs text-zinc-500">100 generations / day</span>
          </button>
          {loading ? <p className="mt-2 font-mono text-xs text-zinc-500">opening checkout…</p> : null}
          {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
