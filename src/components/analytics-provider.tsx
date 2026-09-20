"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";

/**
 * Client-side PostHog: $pageview autoplay, and identifies the signed-in user
 * so client events (CTA clicks on marketing pages) merge with server events
 * (signup, repo_connected, …) into one person timeline.
 * No-ops when NEXT_PUBLIC_POSTHOG_KEY is absent (local dev/preview).
 */
export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return <>{children}</>;

  return (
    <PostHogProvider
      apiKey={key}
      options={{
        api_host: "https://us.i.posthog.com",
        capture_pageview: true,
        capture_pageleave: true,
        persistence: "localStorage+cookie",
        autocapture: false, // deliberate: funnel events are explicit
      }}
    >
      <IdentifyOnMount>{children}</IdentifyOnMount>
    </PostHogProvider>
  );
}

function IdentifyOnMount({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const raw = document.cookie.match(/(?:^|;\s*)docloom_ph=([^;]+)/);
    if (raw) {
      try {
        const { id, login } = JSON.parse(decodeURIComponent(raw[1]));
        posthog.identify(id, { login });
      } catch {
        // malformed hint cookie — ignore; server events still carry the id
      }
    }
  }, []);
  return <>{children}</>;
}

/** Click handler for outbound "Connect your repo"-style CTAs on marketing pages. */
export function trackCtaClick(cta: string): void {
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.capture("cta_clicked", { cta });
  }
}
