import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <p className="font-mono text-sm text-accent">/privacy</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        Privacy Policy
      </h1>
      <div className="mt-6 flex flex-col gap-4 text-sm leading-relaxed text-zinc-400">
        <p>
          The Docloom Privacy Policy is being finalized and will be published
          here before launch. What we&apos;re committing to in the build:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            We do <strong className="text-zinc-200">not</strong> store your raw
            source code beyond the active processing session.
          </li>
          <li>
            GitHub access is strictly read-only — we never request write access.
          </li>
          <li>
            GitHub tokens are encrypted at rest; secrets live in environment
            variables, never in code.
          </li>
          <li>
            Payments are handled entirely by our payment processor — we never
            see card numbers.
          </li>
        </ul>
        <p>
          Until the full policy is published, please{" "}
          <Link href="/" className="text-zinc-200 underline-offset-2 hover:underline">
            head back to the homepage
          </Link>
          .
        </p>
      </div>
    </main>
  );
}