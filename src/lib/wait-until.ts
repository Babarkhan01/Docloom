import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Run work after the response has been sent.
 *
 * On Cloudflare Workers this uses `ctx.waitUntil`, which keeps the invocation
 * alive until the promise settles (CPU limits still apply — callers must keep
 * the work bounded; webhook-triggered runs cap the number of fetched files
 * for exactly that reason).
 *
 * Outside Workers (plain `next dev`) there is no execution context, so the
 * work runs inline before the promise resolves — slower for the caller, but
 * correct for local development.
 */
export async function runAfterResponse(fn: () => Promise<void>): Promise<void> {
  try {
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(fn());
  } catch {
    await fn();
  }
}
