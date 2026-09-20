import Link from "next/link";

/**
 * The Docloom mark: three violet warp threads basket-woven through light weft
 * lines — a loom turning threads into the lines of a document.
 *
 * The weft uses `currentColor` so the mark inherits the surrounding text colour
 * (it reads correctly on dark and light surfaces alike).
 */
export function LogoMark({ className = "h-5 w-6" }: { className?: string }) {
  return (
    <svg
      viewBox="6 10 52 44"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g fill="var(--accent, #8b5cf6)">
        <rect x="16" y="14" width="6" height="36" />
        <rect x="29" y="14" width="6" height="36" />
        <rect x="42" y="14" width="6" height="36" />
      </g>
      <g fill="currentColor">
        {/* weft over the warp */}
        <rect x="10" y="29" width="44" height="6" />
        {/* weft under the warp — broken at each intersection */}
        <rect x="10" y="18" width="6" height="6" />
        <rect x="22" y="18" width="7" height="6" />
        <rect x="35" y="18" width="7" height="6" />
        <rect x="48" y="18" width="6" height="6" />
        <rect x="10" y="40" width="6" height="6" />
        <rect x="22" y="40" width="7" height="6" />
        <rect x="35" y="40" width="7" height="6" />
        <rect x="48" y="40" width="6" height="6" />
      </g>
    </svg>
  );
}

/**
 * The full lockup: mark + "docloom." wordmark, wrapped in a link home.
 *
 * `label` renders a trailing muted tag (e.g. the dashboard's "dashboard").
 */
export function Logo({
  href = "/",
  withWordmark = true,
  label,
  markClassName,
  wordmarkClassName = "font-mono text-base font-semibold tracking-tight",
  className = "inline-flex items-center gap-2",
}: {
  href?: string | null;
  withWordmark?: boolean;
  label?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  className?: string;
}) {
  const lockup = (
    <>
      <LogoMark className={markClassName} />
      {withWordmark ? (
        <span className={wordmarkClassName}>
          docloom<span className="text-accent">.</span>
        </span>
      ) : null}
      {label ? (
        <span className="font-mono text-xs text-zinc-600">{label}</span>
      ) : null}
    </>
  );

  if (!href) {
    return <span className={className}>{lockup}</span>;
  }

  return (
    <Link href={href} className={`${className} transition-opacity hover:opacity-80`}>
      {lockup}
    </Link>
  );
}
