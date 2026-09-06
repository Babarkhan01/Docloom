import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <p className="font-mono text-sm text-accent">/terms</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed text-zinc-400">
        <p>
          The Docloom Terms of Service are being finalized and will be published
          here before launch. The draft covers account registration, repository
          access and your ownership of code and generated docs, subscription and
          billing, acceptable use, an AI-generated-content disclaimer, and
          liability limits.
        </p>
        <p>
          Until then, please{" "}
          <Link href="/" className="text-zinc-200 underline-offset-2 hover:underline">
            head back to the homepage
          </Link>
          .
        </p>
      </div>
    </main>
  );
}