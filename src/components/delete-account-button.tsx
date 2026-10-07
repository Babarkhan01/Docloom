"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Danger-zone control: requires typing DELETE to enable the button, calls
 * POST /api/account/delete, then hard-navigates to the landing page (the
 * session is dead server-side; a soft refresh would bounce to /login).
 */
export function DeleteAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        subscriptionNote?: string | null;
      };
      if (!res.ok) {
        setError(
          data?.subscriptionNote ??
            "Deletion failed — please try again, or email docloom.help@outlook.com.",
        );
        setBusy(false);
        return;
      }
      if (data.subscriptionNote) setNote(data.subscriptionNote);
      // Same navigation as SignOutButton: push + refresh. The session was
      // invalidated server-side, so the refreshed landing page renders signed-out.
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  if (note) {
    return (
      <p className="text-sm text-amber-400">
        {note} Your account has been deleted.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-900/60 px-3 py-1.5 text-sm text-red-400 transition-colors hover:border-red-700 hover:text-red-300"
      >
        Delete account
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-lg border border-red-900/60 bg-red-950/20 p-4">
      <p className="text-sm font-medium text-red-300">Delete your account?</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        This permanently removes your account, connected repos, generation
        history, and takes published docs pages offline. Type{" "}
        <span className="font-mono text-red-300">DELETE</span> to confirm.
      </p>
      <input
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="DELETE"
        aria-label='Type DELETE to confirm account deletion'
        className="mt-3 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 outline-none focus:border-red-700"
      />
      {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={confirmText !== "DELETE" || busy}
          onClick={handleDelete}
          className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Deleting…" : "Permanently delete"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setConfirmText("");
            setError(null);
          }}
          disabled={busy}
          className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
