"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

type AvailableRepo = {
  fullName: string;
  owner: string;
  name: string;
  isPrivate: boolean;
  defaultBranch: string;
};

export function ConnectRepoModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [repos, setRepos] = useState<AvailableRepo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const openModal = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setError(null);
    setRepos(null);
    setQuery("");
    try {
      const res = await fetch("/api/repos/available");
      if (res.status === 401) {
        const data = (await res.json()) as { message?: string };
        setError(data.message ?? "GitHub access expired — please sign in again.");
      } else if (!res.ok) {
        setError("Couldn't load your repositories. Please try again.");
      } else {
        const data = (await res.json()) as { repos: AvailableRepo[] };
        setRepos(data.repos);
      }
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  async function connect(fullName: string) {
    setConnecting(fullName);
    setError(null);
    try {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName }),
      });
      if (res.status === 401) {
        const data = (await res.json()) as { message?: string };
        setError(data.message ?? "GitHub access expired — please sign in again.");
      } else if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? "Couldn't connect this repository.");
      } else {
        setConnected((prev) => new Set(prev).add(fullName));
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setConnecting(null);
    }
  }

  const filtered = repos?.filter((r) =>
    r.fullName.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
      >
        Connect repository
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Connect a repository"
          onClick={() => setOpen(false)}
        >
          <div
            className="mt-8 w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:mt-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Connect a repository
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Read-only access via the Docloom GitHub App. Only repos it&apos;s
                  installed on appear here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-200"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            </div>

            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter repositories…"
              aria-label="Filter repositories"
              className="mb-3 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />

            {error ? (
              <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                {error}
              </div>
            ) : null}

            <div className="max-h-80 overflow-y-auto rounded-md border border-zinc-800">
              {loading ? (
                <p className="p-4 text-sm text-zinc-500">Loading repositories…</p>
              ) : filtered && filtered.length > 0 ? (
                <ul className="divide-y divide-zinc-800">
                  {filtered.map((r) => {
                    const isConnected = connected.has(r.fullName);
                    return (
                      <li
                        key={r.fullName}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono text-sm text-zinc-200">
                            {r.fullName}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
                            {r.isPrivate ? "private" : "public"} · default: {r.defaultBranch}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isConnected || connecting === r.fullName}
                          onClick={() => connect(r.fullName)}
                          className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            isConnected
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-zinc-100 text-zinc-900 hover:bg-white disabled:cursor-wait disabled:opacity-60"
                          }`}
                        >
                          {isConnected ? "Connected" : connecting === r.fullName ? "Connecting…" : "Connect"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="p-4 text-sm text-zinc-500">
                  {repos && repos.length === 0
                    ? "No repositories available. Install the Docloom GitHub App on a repo to connect it."
                    : "No repositories match your filter."}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}