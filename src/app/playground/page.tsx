import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { PlaygroundForm } from "@/components/playground-form";

/**
 * /playground — the no-signup demo: paste a public GitHub repo, get
 * AST-verified docs. Deliberately indexable (robots.ts allows it) and linked
 * from the landing page as the fastest path to first value.
 *
 * Supports ?repo=owner/name deep links (outreach emails, social posts): the
 * form arrives pre-filled so a prospect is one click from their own docs.
 * Nothing auto-runs — generation still requires the visitor's click, so a
 * shared link can't silently burn their daily IP limit.
 */

export const metadata: Metadata = {
  title: "Playground — generate API docs from any public repo | docloom",
  description:
    "Paste a public GitHub repo and get API reference docs generated from the actual source: endpoints, request fields, response shapes — AST-verified, never invented by the AI. No signup.",
};

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ repo?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.repo) ? params.repo[0] : params.repo;
  const initialRepo = raw?.trim() ? raw.trim().slice(0, 200) : undefined;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <header className="mb-8">
        <Link href="/" className="inline-block">
          <Logo markClassName="h-4 w-[19px]" wordmarkClassName="font-mono text-sm font-semibold tracking-tight" />
        </Link>
        <p className="mt-6 font-mono text-xs uppercase tracking-widest text-zinc-500">Playground</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100">
          Docs that come from your code, not the model&apos;s imagination
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Paste a <span className="text-zinc-200">public</span> GitHub repo. Docloom extracts every endpoint, request
          body, and response shape with the TypeScript compiler, then writes short descriptions on top. What it
          can&apos;t prove from source says{" "}
          <span className="font-mono text-zinc-300">&quot;not documented in source&quot;</span> — it never guesses.
          Next.js App Router + zod repos work best.
        </p>
      </header>

      <PlaygroundForm initialRepo={initialRepo} />
    </div>
  );
}
