"use client";

import Link from "next/link";
import { useState } from "react";
import { trackCtaClick } from "@/components/analytics-provider";

/**
 * The playground form: paste a repo → docs → sign-in capture. Client-side
 * because of the running state; all limits are enforced server-side.
 *
 * Accepts initialRepo from /playground?repo=… deep links (outreach, social):
 * pre-fills the input so the prospect is one click from their own docs.
 * The form does NOT auto-generate on mount — one click keeps the visitor in
 * control (and their daily IP limit unspent) while removing all typing.
 */

type Meta = {
  repo: string;
  branch: string;
  endpointCount: number;
  filesScanned: number;
  filesSkipped: number;
  crossFileSchemas: number;
  framework: string | null;
  truncated: boolean;
};

const EXAMPLES = [
  { label: "dub", repo: "steven-tey/dub" },
  { label: "cal.com", repo: "calcom/cal.com" },
  { label: "next.js", repo: "vercel/next.js" },
];

export function PlaygroundForm({ initialRepo }: { initialRepo?: string }) {
  const [repo, setRepo] = useState(initialRepo ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);

  async function generate(target: string) {
    if (!target.trim() || busy) return;
    setBusy(true);
    setError(null);
    setMarkdown(null);
    setMeta(null);
    try {
      const res = await fetch("/api/playground/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo: target }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        markdown?: string;
        meta?: Meta;
        message?: string;
      };
      if (!res.ok || !data.markdown || !data.meta) {
        setError(data.message ?? "Something went wrong — please try again.");
        setBusy(false);
        return;
      }
      setMarkdown(data.markdown);
      setMeta(data.meta);
    } catch {
      setError("Network error — please try again.");
    }
    setBusy(false);
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate(repo);
        }}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder={initialRepo ? "owner/repo — pre-filled from your link, just hit Generate" : "owner/repo — e.g. steven-tey/dub"}
          aria-label="Public GitHub repository"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2.5 font-mono text-sm text-zinc-200 outline-none transition-colors focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={busy || !repo.trim()}
          className="rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Reading the source…" : "Generate docs"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.repo}
            type="button"
            disabled={busy}
            onClick={() => {
              setRepo(ex.repo);
              void generate(ex.repo);
            }}
            className="rounded-full border border-zinc-800 px-2.5 py-1 font-mono text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {busy ? (
        <p className="mt-6 animate-pulse text-sm text-zinc-500">
          Parsing route files with the TypeScript compiler — this takes up to a minute for larger repos.
        </p>
      ) : null}

      {markdown && meta ? (
        <div className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-800 pb-4">
            <h2 className="font-mono text-lg font-semibold text-zinc-100">
              {meta.repo}
              <span className="ml-2 text-sm font-normal text-zinc-500">branch {meta.branch}</span>
            </h2>
            <p className="text-xs text-zinc-500">
              {meta.endpointCount} endpoint{meta.endpointCount === 1 ? "" : "s"} · {meta.filesScanned} route file
              {meta.filesScanned === 1 ? "" : "s"} scanned
              {meta.crossFileSchemas > 0 ? ` · ${meta.crossFileSchemas} cross-file schemas resolved` : ""}
            </p>
          </div>

          {meta.framework ? (
            <p className="mt-4 rounded-md border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-sm text-amber-300">
              This repo appears to use {meta.framework}. Docloom currently indexes Next.js App Router route handlers.
            </p>
          ) : null}

          <pre className="mt-4 max-h-[32rem] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-[12px] leading-relaxed text-zinc-300 whitespace-pre-wrap break-words">
            {markdown}
          </pre>

          <div className="mt-6 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 p-5">
            <p className="text-sm font-medium text-zinc-100">
              {meta.truncated
                ? "This output was truncated to fit the playground."
                : "That's your repo, parsed — not guessed."}
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Sign in to save these docs, publish them at your own URL, and auto-regenerate on every merge.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                // P1.6: carry the repo through sign-in so the prospect lands in
                // the connect flow for the repo they just generated, not an
                // empty dashboard.
                href={`/login?next=${encodeURIComponent(`/dashboard?connect=${meta.repo}`)}`}
                onClick={() => trackCtaClick("playground_save_docs")}
                className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
              >
                Save these docs
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMarkdown(null);
                  setMeta(null);
                  setError(null);
                }}
                className="rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Try another repo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
