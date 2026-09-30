import Link from "next/link";
import { Logo } from "@/components/logo";
import { TrackedCtaLink } from "@/components/tracked-cta-link";

/**
 * Shared layout for the factual comparison pages under /vs/* and the
 * /generate-openapi-from-zod guide. Server-rendered (no client state) — each
 * page supplies its own copy and metadata, and every page ends in the same
 * playground CTA so the comparison leads to real output rather than a signup
 * wall.
 *
 * Tone rule for callers: state what each tool does, and name the cases where
 * the other tool is the better fit. No trash talk.
 */

export type ComparisonRow = { dimension: string; docloom: string; other: string };
export type ComparisonSection = { heading: string; body: string };

export function ComparisonPage({
  eyebrow,
  title,
  intro,
  otherLabel,
  rows,
  sections,
  playgroundRepo,
  ctaId,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  /** Column header for the tool being compared. */
  otherLabel: string;
  rows: ComparisonRow[];
  sections: ComparisonSection[];
  /** Pre-fills the playground with a repo that demonstrates the point. */
  playgroundRepo?: string;
  /** Analytics id for the playground CTA. */
  ctaId: string;
}) {
  const playHref = playgroundRepo
    ? `/playground?repo=${encodeURIComponent(playgroundRepo)}`
    : "/playground";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Link href="/" className="inline-block">
        <Logo
          markClassName="h-4 w-[19px]"
          wordmarkClassName="font-mono text-sm font-semibold tracking-tight"
        />
      </Link>

      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-zinc-500">{eyebrow}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">{title}</h1>
      <p className="mt-4 text-sm leading-relaxed text-zinc-400">{intro}</p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left font-mono text-xs font-normal text-zinc-500">
                &nbsp;
              </th>
              <th className="border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left font-mono text-xs text-zinc-200">
                Docloom
              </th>
              <th className="border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left font-mono text-xs text-zinc-400">
                {otherLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.dimension}>
                <td className="border border-zinc-800 px-3 py-2 align-top font-mono text-xs text-zinc-500">
                  {row.dimension}
                </td>
                <td className="border border-zinc-800 px-3 py-2 align-top text-zinc-300">{row.docloom}</td>
                <td className="border border-zinc-800 px-3 py-2 align-top text-zinc-400">{row.other}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-10 flex flex-col gap-6">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-medium tracking-tight text-zinc-100">{section.heading}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{section.body}</p>
          </section>
        ))}
      </div>

      <section className="mt-12 rounded-lg border border-accent/40 bg-accent/10 p-6">
        <h2 className="text-base font-medium text-zinc-100">See it on a real repo</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">
          Paste a public GitHub repo and get the same AST-verified API reference the product produces.
          No account, no persistence, about a minute.
        </p>
        <TrackedCtaLink
          cta={ctaId}
          href={playHref}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          Open the playground
        </TrackedCtaLink>
      </section>
    </div>
  );
}
