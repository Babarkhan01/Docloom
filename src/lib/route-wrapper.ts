import { NextResponse } from "next/server";
import { dispatchAlert, configuredSinks } from "./alerts";
import { runAfterResponse } from "./wait-until";

/**
 * Wrap a route handler so an unexpected failure (transient DB/network errors
 * and the like) becomes a logged, clean 500 JSON response instead of Next's
 * generic error page. Expected error paths (401/404/409, validation) stay
 * inside the handler — this only catches what escapes.
 *
 * Unhandled errors also fire an ops alert (DOCLOOM_ALERT_WEBHOOK_URL) after
 * the response is sent — background, never adding latency to the 500.
 */
export function withRouteErrors<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${route}] unhandled route error:`, err);
      runAfterResponse(async () => {
        await dispatchAlert(
          {
            title: `Unhandled route error: ${route}`,
            body: message,
            severity: "error",
          },
          configuredSinks(),
        );
      }).catch(() => {});
      return NextResponse.json(
        { error: "internal_error", message: "Something went wrong — please try again." },
        { status: 500 },
      );
    }
  };
}
