"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Generate / Publish / Discard controls for a repo. The Generate button runs
 * the pipeline synchronously via POST /api/repos/[id]/generate; publishing
 * requires explicit approval of the draft (never auto-published).
 */
export function GenerationActions({
  repoId,
  draftGenerationId,
  hasUnpublishedChanges,
}: {
  repoId: string;
  draftGenerationId: string | null;
  hasUnpublishedChanges: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"generate" | "publish" | "discard" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "generate" | "publish" | "discard") {
    setBusy(action);
    setError(null);
    try {
      // Publish must name the exact draft being approved (API contract); the
      // other actions take no body.
      const init: RequestInit =
        action === "publish"
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ generationId: draftGenerationId }),
            }
          : { method: "POST" };
      if (action === "publish" && !draftGenerationId) {
        setError("No draft to publish — generate first.");
        return;
      }
      const res = await fetch(`/api/repos/${repoId}/${action}`, init);
      const body = (await res.json().catch(() => ({}))) as { message?: string; endpointCount?: number; aiUsed?: boolean };
      if (!res.ok) {
        setError(body.message ?? `Request failed (${res.status})`);
        return;
      }
      if (action === "generate" && typeof body.endpointCount === "number") {
        setError(
          body.endpointCount === 0
            ? "Done — no HTTP endpoints detected in this repo (route.ts files)."
            : `Parsed ${body.endpointCount} endpoint${body.endpointCount === 1 ? "" : "s"}${body.aiUsed ? " · AI descriptions written" : " · structural only (no AI key set)"}`,
        );
      }
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "rounded-lg px-4 py-2 font-mono text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {draftGenerationId ? (
          <>
            <button
              type="button"
              onClick={() => call("discard")}
              disabled={busy !== null || !draftGenerationId}
              className={`${btn} border border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200`}
            >
              {busy === "discard" ? "Discarding…" : "Discard draft"}
            </button>
            {hasUnpublishedChanges ? (
              <button
                type="button"
                onClick={() => call("publish")}
                disabled={busy !== null}
                className={`${btn} bg-emerald-500/90 text-zinc-950 hover:bg-emerald-400`}
              >
                {busy === "publish" ? "Publishing…" : "Publish"}
              </button>
            ) : null}
          </>
        ) : null}
        <button
          type="button"
          onClick={() => call("generate")}
          disabled={busy !== null}
          className={`${btn} bg-zinc-100 text-zinc-950 hover:bg-white`}
        >
          {busy === "generate" ? "Generating…" : draftGenerationId ? "Regenerate" : "Generate"}
        </button>
      </div>
      {error ? (
        <p className={`max-w-xs text-right font-mono text-[11px] ${error.startsWith("Done") || error.startsWith("Parsed") ? "text-zinc-500" : "text-red-400"}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
