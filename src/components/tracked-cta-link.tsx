"use client";

import { trackCtaClick } from "@/components/analytics-provider";

/**
 * Outbound/CTA anchor that reports clicks to PostHog before the browser
 * navigates. Use for conversion-relevant CTAs on marketing pages; ordinary
 * in-app links don't need this.
 */
export function TrackedCtaLink({
  cta,
  href,
  className,
  children,
}: {
  cta: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => trackCtaClick(cta)}
    >
      {children}
    </a>
  );
}
