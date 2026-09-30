/**
 * Transactional email — one provider, no SDK, fire-and-forget friendly.
 *
 * Resend over plain `fetch` (its REST API) so the module works unchanged in
 * the Workers runtime: no TCP sockets, no Node-only SDK. Configured entirely
 * by env vars; with `RESEND_API_KEY` unset every send is a no-op, exactly like
 * lib/alerts.ts. That keeps local dev and tests quiet without special-casing.
 *
 * Used today for the "your docs regenerated — review the draft" notification
 * (P1.5), which links to the shareable diff view (P2.8). Keep the template
 * builders pure/exported so they can be unit-tested without a network.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

/** Whether email delivery is configured (a key is present). */
export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * Verified sender. Defaults to Resend's shared onboarding address so a
 * half-configured deployment still sends (and lands in spam) rather than
 * silently dropping; production should set EMAIL_FROM to a verified domain.
 */
export function emailFrom(): string {
  return process.env.EMAIL_FROM || "Docloom <onboarding@resend.dev>";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send one message. Returns false when email is unconfigured (no-op). Throws
 * on a transport/provider failure — callers on background paths swallow and
 * log, so a mail outage never fails a generation run.
 */
export async function sendEmail(
  message: EmailMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!emailEnabled()) return false;

  const res = await fetchImpl(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: emailFrom(),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend responded HTTP ${res.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type RegenerationNotice = {
  to: string;
  repoFullName: string;
  branch: string;
  endpointCount: number;
  /** Signed, unlisted shareable diff view (P2.8). */
  diffUrl: string;
  /** Owner-facing dashboard for the repo. */
  dashboardUrl: string;
};

/** Build the regeneration notification (pure — no env reads, no I/O). */
export function regenerationEmail(input: RegenerationNotice): EmailMessage {
  const { to, repoFullName, branch, endpointCount, diffUrl, dashboardUrl } = input;
  const repo = escapeHtml(repoFullName);
  const br = escapeHtml(branch);

  const subject = `Docs regenerated for ${repoFullName} — review the diff`;
  const text = [
    `Docloom regenerated the API docs for ${repoFullName} (branch ${branch}) from your latest push.`,
    "",
    `${endpointCount} endpoint${endpointCount === 1 ? "" : "s"} parsed from source. Nothing is published yet — review the draft against what is live and publish it when you're happy:`,
    diffUrl,
    "",
    `Dashboard: ${dashboardUrl}`,
    "",
    "— Docloom",
  ].join("\n");

  const html = `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#09090b;color:#f4f4f5;padding:32px;">
    <div style="max-width:520px;margin:0 auto;">
      <p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8b5cf6;margin:0 0 8px;">docloom</p>
      <h1 style="font-size:18px;margin:0 0 12px;">Docs regenerated for ${repo}</h1>
      <p style="font-size:14px;line-height:1.6;color:#a1a1aa;margin:0 0 16px;">
        Your push to <span style="font-family:ui-monospace,monospace;color:#e4e4e7;">${br}</span> produced a new
        draft — <strong style="color:#e4e4e7;">${endpointCount} endpoint${endpointCount === 1 ? "" : "s"}</strong>
        parsed from source. Nothing is published until you approve it.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${diffUrl}" style="display:inline-block;background:#8b5cf6;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-size:14px;">Review the diff</a>
      </p>
      <p style="font-size:13px;color:#71717a;margin:0;">
        Or open the <a href="${dashboardUrl}" style="color:#a1a1aa;">dashboard</a>.
      </p>
    </div>
  </body>
</html>`;

  return { to, subject, html, text };
}

/**
 * Convenience: build + send. Returns false when email is unconfigured. Kept
 * separate from the template so callers can pass a custom transport in tests.
 */
export async function sendRegenerationNotification(
  input: RegenerationNotice,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  return sendEmail(regenerationEmail(input), fetchImpl);
}
