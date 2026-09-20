"use client";

import { useMemo, useState } from "react";
import { diffLines, type Change } from "diff";

/**
 * Draft-vs-published diff for the repo page (Phase 2 task B10). The draft is
 * never auto-published — this is the review surface: a collapsible line diff
 * so the user can see exactly what a regeneration (manual or webhook)
 * changed before approving it.
 */
export function DraftDiff({ oldMarkdown, newMarkdown }: { oldMarkdown: string; newMarkdown: string }) {
  const [open, setOpen] = useState(false);

  const changes: Change[] = useMemo(() => diffLines(oldMarkdown, newMarkdown), [oldMarkdown, newMarkdown]);
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const c of changes) {
      if (c.added) added += c.count ?? 0;
      if (c.removed) removed += c.count ?? 0;
    }
    return { added, removed };
  }, [changes]);

  const unchanged = stats.added === 0 && stats.removed === 0;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
      >
        {open ? "Hide diff" : "View diff vs published"}
        <span className="ml-2 text-emerald-400">+{stats.added}</span>
        <span className="ml-1 text-red-400">−{stats.removed}</span>
      </button>
      {unchanged ? (
        <span className="ml-3 font-mono text-[11px] text-zinc-500">draft is identical to the published version</span>
      ) : null}
      {open ? (
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-5">
          {changes.map((c, i) =>
            c.value.split("\n").map((line, j) => {
              if (line === "" && j === c.value.split("\n").length - 1) return null;
              const prefix = c.added ? "+" : c.removed ? "-" : " ";
              const cls = c.added
                ? "bg-emerald-500/10 text-emerald-300"
                : c.removed
                  ? "bg-red-500/10 text-red-300"
                  : "text-zinc-500";
              return (
                <span key={`${i}-${j}`} className={`block ${cls}`}>
                  {prefix} {line}
                </span>
              );
            }),
          )}
        </pre>
      ) : null}
    </div>
  );
}
