/**
 * Lightweight ops alerting — one env var, no SDK, no vendor lock-in.
 *
 * DOCLOOM_ALERT_WEBHOOK_URL, when set, receives a Slack-compatible
 * `{ text }` POST for operational failures: unhandled route errors, failed
 * generation runs, dead webhook handlers. Slack, Discord (with /slack
 * suffix — its incoming-webhook bridge accepts the same payload shape), or
 * any simple receiver all work. Unset (local dev, preview builds) → every
 * call is a no-op, exactly like analytics.ts.
 *
 * Design rules (mirroring the project's fire-and-forget conventions):
 * - Alerts must never break the request they report: sinks are wrapped in
 *   try/catch and dispatch is bounded by a 3s fetch timeout.
 * - Callers decide sync vs. background: on the Dodo/GitHub webhook paths use
 *   runAfterResponse(() => dispatchAlert(...)) so delivery never adds latency.
 * - Bodies are capped — a runaway stack trace must not flood a chat channel.
 */

const BODY_MAX_CHARS = 800;

export type AlertSeverity = "error" | "warning";

export type Alert = {
  title: string;
  body: string;
  severity: AlertSeverity;
};

export type AlertSink = (alert: Alert) => Promise<void>;

/**
 * Deliver an alert to every sink. Never throws; returns how many sinks
 * accepted the alert (best-effort delivery count, for logging in tests).
 */
export async function dispatchAlert(alert: Alert, sinks: AlertSink[]): Promise<number> {
  if (sinks.length === 0) return 0;

  const capped: Alert = {
    ...alert,
    body:
      alert.body.length > BODY_MAX_CHARS
        ? `${alert.body.slice(0, BODY_MAX_CHARS - 1)}…` // ellipsis included in the cap
        : alert.body,
  };

  let delivered = 0;
  await Promise.all(
    sinks.map(async (sink) => {
      try {
        await sink(capped);
        delivered += 1;
      } catch (err) {
        console.error("[alerts] sink delivery failed:", err);
      }
    }),
  );
  return delivered;
}

/**
 * The one sink the MVP needs: POST { text } to DOCLOOM_ALERT_WEBHOOK_URL.
 * Returns null when unconfigured so callers can skip dispatch entirely.
 */
export function webhookSink(url: string | undefined = process.env.DOCLOOM_ALERT_WEBHOOK_URL): AlertSink | null {
  if (!url) return null;
  return async (alert: Alert) => {
    const text = `[docloom] ⚠️ ${alert.severity === "error" ? "ERROR" : "WARN"} — ${alert.title}\n${alert.body}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      // Swallowed by dispatchAlert's contract — logged for the Workers tail.
      throw new Error(`alert webhook responded HTTP ${res.status}`);
    }
  };
}

/**
 * Convenience for request contexts: build the configured sink list once.
 * Extra sinks can be appended later (e.g. a Sentry transport) without
 * touching call sites.
 */
export function configuredSinks(): AlertSink[] {
  const sink = webhookSink();
  return sink ? [sink] : [];
}
