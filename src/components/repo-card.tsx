import Link from "next/link";
import type { GenerationStatus } from "@/lib/schema";
import { StatusBadge } from "./status-badge";

export type RepoCardRepo = {
  id: string;
  fullName: string;
  isPrivate: boolean;
  defaultBranch: string;
  docsSubdomain: string;
  status: string;
  connectedAt: Date;
  /** Published docs exist → the public /docs/{subdomain} page is live. */
  isHosted: boolean;
};

export type RepoCardGeneration = {
  status: GenerationStatus;
  errorMessage: string | null;
} | null;

export function RepoCard({
  repo,
  lastGeneration,
}: {
  repo: RepoCardRepo;
  lastGeneration: RepoCardGeneration;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-mono text-sm font-semibold tracking-tight text-zinc-100">
          <Link href={`/dashboard/repos/${repo.id}`} className="hover:text-accent">
            {repo.fullName}
          </Link>
        </h2>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ring-1 ring-inset ${
            repo.isPrivate
              ? "bg-zinc-800 text-zinc-400 ring-zinc-700"
              : "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
          }`}
        >
          {repo.isPrivate ? "private" : "public"}
        </span>
      </div>

      <dl className="flex flex-col gap-1.5 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Docs</dt>
          <dd className="font-mono text-zinc-400">
            {repo.isHosted ? (
              <>
                <Link href={`/docs/${repo.docsSubdomain}`} className="hover:text-accent">
                  /docs/{repo.docsSubdomain}
                </Link>{" "}
                <Link
                  href={`/docs/${repo.docsSubdomain}`}
                  className="text-emerald-500 hover:text-emerald-400 hover:underline"
                  title="Open live docs"
                >
                  · hosted
                </Link>
              </>
            ) : (
              <>
                /docs/{repo.docsSubdomain}{" "}
                <span className="text-zinc-600">· not hosted yet</span>
              </>
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Default branch</dt>
          <dd className="font-mono text-zinc-400">{repo.defaultBranch}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Generation</dt>
          <dd>
            <StatusBadge status={lastGeneration?.status ?? null} />
            {lastGeneration?.status === "failed" && lastGeneration.errorMessage ? (
              <p className="mt-1 font-mono text-[11px] text-red-400">
                {lastGeneration.errorMessage}
              </p>
            ) : null}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-500">Connected</dt>
          <dd className="text-zinc-400">
            {repo.connectedAt.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </dd>
        </div>
      </dl>
    </article>
  );
}