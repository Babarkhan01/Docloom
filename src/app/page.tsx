import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { GitHubIcon } from "@/components/github-icon";
import { Logo } from "@/components/logo";
import { TrackedCtaLink } from "@/components/tracked-cta-link";

const STEPS = [
  {
    n: "01",
    title: "Connect a repo",
    body: "Sign in with GitHub and pick a repository — public or private. Read-only access, nothing is ever written back to your code.",
  },
  {
    n: "02",
    title: "We parse, then we write",
    body: "An AST parser extracts the structural facts — routes, signatures, param and return types — and AI writes descriptions on top. Facts come from code, not from the model.",
  },
  {
    n: "03",
    title: "Docs, hosted",
    body: "Structured markdown, published to a clean docs site on your own subdomain. Regenerate anytime and preview the diff before it goes live.",
  },
];

const FAQ = [
  {
    q: "Will it hallucinate my API?",
    a: "Structural facts (endpoints, function signatures, types) come from deterministic AST parsing of your code — the AI only writes natural-language descriptions on top of that structure. Treat the prose as a strong first draft worth reviewing, not an infallible oracle.",
  },
  {
    q: "Do you store my source code?",
    a: "No. We fetch your repo, process it in memory to generate docs, and discard the raw code. We never retain source beyond the active processing session.",
  },
];

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <Logo />
        <nav className="flex items-center gap-4 text-sm text-zinc-400">
          <a href="#how-it-works" className="transition-colors hover:text-zinc-200">
            How it works
          </a>
          <Link href="/login" className="transition-colors hover:text-zinc-200">
            Sign in
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        {/* Hero */}
        <section className="py-20 sm:py-28">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-800 px-3 py-1 font-mono text-xs text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            AST-verified structure · AI-written descriptions
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Docs that track{" "}
            <span className="text-zinc-500">your code.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
            Point Docloom at your GitHub repo and get accurate, structured
            markdown docs for your API — hosted on a clean docs site, regenerated
            whenever your code changes.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <TrackedCtaLink
              cta="hero_connect_repo"
              href="/api/auth/github"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-zinc-100 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
            >
              <GitHubIcon />
              Connect your repo
            </TrackedCtaLink>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center rounded-md border border-zinc-800 px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              How it works
            </a>
          </div>
          <p className="mt-4 font-mono text-xs text-zinc-600">
            GitHub sign-in · read-only access · no credit card
          </p>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-8 py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <div
                key={step.n}
                className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <p className="font-mono text-sm text-accent">{step.n}</p>
                <h3 className="mt-3 text-base font-medium text-zinc-100">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
          <div className="mt-8 flex flex-col gap-6">
            {FAQ.map((item) => (
              <div key={item.q} className="max-w-2xl">
                <h3 className="text-base font-medium text-zinc-100">{item.q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}