import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { db } from "@/lib/db";
import { generations, repos } from "@/lib/schema";
import { getAuthorizedUser } from "@/lib/session";
import { GenerationActions } from "@/components/generation-actions";

export const dynamic = "force-dynamic";

const mdComponents = {
  table: (p: React.ComponentProps<"table">) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p: React.ComponentProps<"th">) => (
    <th className="border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-left font-mono text-xs text-zinc-200" {...p} />
  ),
  td: (p: React.ComponentProps<"td">) => (
    <td className="border border-zinc-800 px-3 py-1.5 align-top text-zinc-300" {...p} />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[12px] text-zinc-300" {...p} />
  ),
  pre: (p: React.ComponentProps<"pre">) => <pre className="my-3 overflow-x-auto" {...p} />,
};

function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm leading-relaxed text-zinc-300 [&_h1]:mt-2 [&_h1]:mb-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:text-zinc-100 [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:font-mono [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-zinc-100 [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:font-mono [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:text-accent [&_p]:my-2 [&_li]:my-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default async function RepoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const authorized = await getAuthorizedUser();
  if (!authorized) redirect("/login");
  const { id } = await params;

  const [repo] = await db
    .select()
    .from(repos)
    .where(and(eq(repos.id, id), eq(repos.userId, authorized.user.id)))
    .limit(1);
  if (!repo) notFound();

  // Published docs = the generation the pointer references (must belong to
  // this repo and be published).
  const [published] = repo.publishedGenerationId
    ? await db
        .select()
        .from(generations)
        .where(
          and(
            eq(generations.id, repo.publishedGenerationId),
            eq(generations.repoId, repo.id),
            eq(generations.status, "success"),
          ),
        )
        .limit(1)
    : [];

  // Draft = newest successful generation not yet published.
  const [draft] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.repoId, repo.id), eq(generations.status, "success"), isNull(generations.publishedAt)))
    .orderBy(desc(generations.completedAt))
    .limit(1);

  const history = await db
    .select({
      id: generations.id,
      status: generations.status,
      tokensUsed: generations.tokensUsed,
      startedAt: generations.startedAt,
      completedAt: generations.completedAt,
      errorMessage: generations.errorMessage,
      publishedAt: generations.publishedAt,
    })
    .from(generations)
    .where(eq(generations.repoId, repo.id))
    .orderBy(desc(generations.startedAt))
    .limit(10);

  const hasUnpublishedChanges = Boolean(draft && (!published || draft.completedAt! > published.publishedAt!));

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <Link href="/dashboard" className="font-mono text-xs text-zinc-500 hover:text-zinc-300">
            ← dashboard
          </Link>
          <h1 className="mt-2 font-mono text-lg font-semibold tracking-tight text-zinc-100">
            {repo.githubRepoFullName}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            branch <span className="font-mono text-zinc-400">{repo.defaultBranch}</span> ·{" "}
            {repo.publishedGenerationId ? (
              <>
                docs at{" "}
                <Link href={`/docs/${repo.docsSubdomain}`} className="font-mono text-zinc-300 hover:text-accent">
                  /docs/{repo.docsSubdomain}
                </Link>{" "}
                <span className="text-emerald-500">· hosted</span>
              </>
            ) : (
              <>
                docs at <span className="font-mono text-zinc-400">/docs/{repo.docsSubdomain}</span>{" "}
                <span className="text-zinc-600">· not hosted yet — publish to go live</span>
              </>
            )}
          </p>
        </div>
        <GenerationActions
          repoId={repo.id}
          draftGenerationId={draft?.id ?? null}
          hasUnpublishedChanges={hasUnpublishedChanges}
        />
      </header>

      {draft ? (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-zinc-100">
              {hasUnpublishedChanges ? "Draft — review before publishing" : "Draft (already published)"}
            </h2>
            <span className="font-mono text-[11px] text-zinc-500">
              generated{" "}
              {draft.completedAt?.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          {published && hasUnpublishedChanges ? (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-400">
              This draft differs from the published version — publish to replace it, or discard.
            </p>
          ) : null}
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <Markdown>{draft.markdown ?? ""}</Markdown>
          </article>
        </section>
      ) : null}

      {published && (!draft || hasUnpublishedChanges) ? (
        <section className="mb-8">
          <h2 className="mb-3 font-mono text-sm font-semibold text-zinc-100">
            Published{" "}
            <span className="font-mono text-[11px] font-normal text-zinc-500">
              · published {published.publishedAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          </h2>
          <article className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
            <Markdown>{published.markdown ?? ""}</Markdown>
          </article>
        </section>
      ) : null}

      {!draft && !published ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-16 text-center">
          <p className="font-mono text-sm text-zinc-500">no docs yet</p>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
            Click <span className="font-mono text-zinc-200">Generate</span> to parse{" "}
            <span className="font-mono">{repo.githubRepoFullName}</span> with a TypeScript AST
            (read-only, nothing is stored) and draft its API documentation. You review the result
            here before anything is published.
          </p>
        </div>
      ) : null}

      {history.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-3 font-mono text-sm font-semibold text-zinc-100">History</h2>
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                <span className="font-mono text-zinc-400">
                  {h.startedAt?.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </span>
                <span
                  className={
                    h.status === "success"
                      ? "font-mono text-emerald-400"
                      : h.status === "failed"
                        ? "font-mono text-red-400"
                        : "font-mono text-amber-400"
                  }
                >
                  {h.status}
                  {h.publishedAt ? " · published" : ""}
                </span>
                <span className="font-mono text-zinc-600">{h.tokensUsed != null ? `${h.tokensUsed} tokens` : "no AI"}</span>
                {h.errorMessage ? <span className="truncate font-mono text-red-400/80">{h.errorMessage}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
