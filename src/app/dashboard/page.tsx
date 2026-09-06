import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { generations, repos } from "@/lib/schema";
import { getAuthorizedUser } from "@/lib/session";
import { ConnectRepoModal } from "@/components/connect-repo-modal";
import { RepoCard } from "@/components/repo-card";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const authorized = await getAuthorizedUser();
  if (!authorized) redirect("/login");

  const userRepos = await db
    .select()
    .from(repos)
    .where(eq(repos.userId, authorized.user.id))
    .orderBy(desc(repos.connectedAt));

  const ids = userRepos.map((r) => r.id);
  const genRows = ids.length
    ? await db.select().from(generations).where(inArray(generations.repoId, ids))
    : [];

  const latestByRepo = new Map<string, (typeof genRows)[number]>();
  for (const g of genRows) {
    const current = latestByRepo.get(g.repoId);
    const gKey = (g.completedAt ?? g.startedAt ?? new Date(0)).getTime();
    const curKey = current
      ? (current.completedAt ?? current.startedAt ?? new Date(0)).getTime()
      : -1;
    if (!current || gKey > curKey) latestByRepo.set(g.repoId, g);
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-10 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="font-mono text-base font-semibold tracking-tight">
            docloom<span className="text-accent">.</span>
          </Link>
          <span className="font-mono text-xs text-zinc-600">dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {authorized.user.avatarUrl ? (
            <Image
              src={authorized.user.avatarUrl}
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
            />
          ) : null}
          <span className="font-mono text-sm text-zinc-400">
            {authorized.user.login}
          </span>
          <SignOutButton />
        </div>
      </header>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Repositories</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Connect a repo to generate and host its docs.
          </p>
        </div>
        <ConnectRepoModal />
      </div>

      {userRepos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-16 text-center">
          <p className="font-mono text-sm text-zinc-500">no connected repos</p>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-zinc-400">
            Connect your first repository to start generating docs. Docloom will
            request read-only access — it can never modify your code.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {userRepos.map((r) => {
            const gen = latestByRepo.get(r.id);
            return (
              <RepoCard
                key={r.id}
                repo={{
                  id: r.id,
                  fullName: r.githubRepoFullName,
                  isPrivate: r.isPrivate,
                  defaultBranch: r.defaultBranch,
                  docsSubdomain: r.docsSubdomain,
                  status: r.status,
                  connectedAt: r.connectedAt,
                }}
                lastGeneration={
                  gen
                    ? {
                        status: gen.status,
                        errorMessage: gen.errorMessage,
                      }
                    : null
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}