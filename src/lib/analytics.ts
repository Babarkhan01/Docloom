/**
 * PostHog product analytics — server-side events for the activation funnel:
 *
 *   pageview → signup → repo_connected → docs_generated → docs_published
 *
 * Design notes:
 * - Server-side capture (this module) so events fire even for users with
 *   blockers, and so `distinct_id` is the real user id, not a cookie uuid.
 * - Fire-and-forget: `flushAt: 1` + detached `.catch()` — the request must
 *   never wait on or fail because of analytics. A PostHog outage is invisible.
 * - Unconfigured (no POSTHOG_KEY) → every call is a no-op, so local dev and
 *   preview builds never need the key.
 */

const POSTHOG_HOST = "https://us.i.posthog.com";

type PostHogClient = {
  capture: (
    distinctId: string,
    event: string,
    properties?: Record<string, unknown>,
  ) => void;
  shutdown: () => Promise<void>;
};

let cached: PostHogClient | null = null;
let initTried = false;

async function getClient(): Promise<PostHogClient | null> {
  const key = process.env.POSTHOG_KEY;
  if (!key) return null; // not configured — analytics is opt-in via env
  if (cached) return cached;
  if (initTried) return null; // a previous init failed; don't retry every request
  initTried = true;
  try {
    const { PostHog } = await import("posthog-node");
    cached = new PostHog(key, {
      host: POSTHOG_HOST,
      flushAt: 1, // send immediately — Workers instances are short-lived
      flushInterval: 0,
      fetch: (url, options) =>
        fetch(url, { ...options, signal: AbortSignal.timeout(2500) }),
    }) as unknown as PostHogClient;
    return cached;
  } catch (err) {
    console.error("PostHog init failed (analytics disabled):", err);
    return null;
  }
}

/**
 * Fire-and-forget product event. Never throws, never blocks: the returned
 * promise is detached and swallows all errors by design.
 */
export function track(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
): void {
  void (async () => {
    try {
      const client = await getClient();
      if (!client) return;
      client.capture(distinctId, event, properties);
      await client.shutdown(); // flushNow; with flushAt:1 this is one POST
    } catch (err) {
      console.error(`PostHog capture failed for '${event}':`, err);
    }
  })();
}
