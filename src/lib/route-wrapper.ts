import { NextResponse } from "next/server";

/**
 * Wrap a route handler so an unexpected failure (transient DB/network errors
 * and the like) becomes a logged, clean 500 JSON response instead of Next's
 * generic error page. Expected error paths (401/404/409, validation) stay
 * inside the handler — this only catches what escapes.
 */
export function withRouteErrors<Args extends unknown[]>(
  route: string,
  handler: (...args: Args) => Promise<NextResponse>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error(`[${route}] unhandled route error:`, err);
      return NextResponse.json(
        { error: "internal_error", message: "Something went wrong — please try again." },
        { status: 500 },
      );
    }
  };
}
