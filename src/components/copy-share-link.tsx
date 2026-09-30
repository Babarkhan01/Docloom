"use client";

import { useState } from "react";

/**
 * "Share diff" control on the repo page (P2.8): opens the signed, unlisted
 * diff for a draft and copies the link, so the same URL can go into a
 * teammate's Slack thread or the regeneration notification email.
 */
export function CopyShareLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = `${window.location.origin}/share/diff/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — the link is still
      // reachable via the anchor next to this button.
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <a
        href={`/share/diff/${token}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
      >
        Open share view
      </a>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
    </span>
  );
}
