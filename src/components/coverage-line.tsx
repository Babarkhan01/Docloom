import type { RouteCoverageSummary } from "@/lib/docs";

/**
 * One-line parser-coverage summary for a docs draft ("42 endpoints · 2 with
 * untyped params · 8 wrapped handlers"). Renders nothing when there is
 * nothing to report (zero endpoints), so a draft never advertises a coverage
 * line it can't back up.
 */
export function CoverageLine({ coverage }: { coverage: RouteCoverageSummary }) {
  if (coverage.total <= 0) return null;
  const parts: string[] = [`${coverage.total} endpoint${coverage.total === 1 ? "" : "s"}`];
  if (coverage.withRequestBody > 0) {
    parts.push(`${coverage.withRequestBody} with request body${coverage.withRequestBody === 1 ? "" : "s"}`);
  }
  if (coverage.withResponses > 0) {
    parts.push(`${coverage.withResponses} with response shape${coverage.withResponses === 1 ? "" : "s"}`);
  }
  if (coverage.withInputs > 0) {
    parts.push(`${coverage.withInputs} with query/header input${coverage.withInputs === 1 ? "" : "s"}`);
  }
  if (coverage.untypedParams > 0) {
    parts.push(`${coverage.untypedParams} with untyped param${coverage.untypedParams === 1 ? "" : "s"}`);
  }
  if (coverage.wrapped > 0) {
    parts.push(`${coverage.wrapped} wrapped handler${coverage.wrapped === 1 ? "" : "s"}`);
  }
  return (
    <p className="mb-3 font-mono text-[11px] text-zinc-500" data-testid="coverage-line">
      {parts.join(" · ")}
    </p>
  );
}
