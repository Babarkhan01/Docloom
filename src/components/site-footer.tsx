import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/eula", label: "EULA" },
  { href: "/cookies", label: "Cookies" },
  { href: "/refunds", label: "Refunds" },
];

/**
 * Site-wide footer: legal links visible on every page. Rendered by the root
 * layout so every route (landing, dashboard, docs hosting, policy pages)
 * gets the same footer without per-page duplication.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-5xl border-t border-zinc-900 px-6 py-8 text-sm text-zinc-600">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono">© {new Date().getFullYear()} docloom</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_LINKS.map(({ href, label }) => (
            <Link key={href} href={href} className="transition-colors hover:text-zinc-400">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
