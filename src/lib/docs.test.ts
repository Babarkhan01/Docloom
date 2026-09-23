import { describe, expect, it } from "vitest";
import { buildApiMarkdown, coverageSummaryFromMarkdown } from "./docs";
import type { ParsedRoute } from "./route-parser";

function route(partial: Partial<ParsedRoute>): ParsedRoute {
  return {
    filePath: "app/api/x/route.ts",
    sourceContent: "",
    routePath: "/api/x",
    method: "GET",
    dynamicSegments: [],
    params: [],
    hasRequestUsage: false,
    returnsResponse: true,
    jsdoc: null,
    exportedSymbols: ["GET"],
    ...partial,
  };
}

describe("coverageSummaryFromMarkdown", () => {
  it("counts endpoints, untyped params, and wrapped handlers from a real draft", () => {
    const routes = [
      route({
        routePath: "/api/tokens/[id]",
        method: "GET",
        dynamicSegments: ["id"],
        wrapped: true,
        wrappedVia: "withWorkspace",
        params: [{ name: "params", type: "", kind: "url", typeResolved: false }],
      }),
      route({ routePath: "/api/repos", method: "POST" }),
      route({ routePath: "/api/csrf", method: "GET" }),
    ];
    const markdown = buildApiMarkdown("o/r", "main", routes, new Map());
    const summary = coverageSummaryFromMarkdown(markdown);
    expect(summary).toEqual({ total: 3, untypedParams: 1, wrapped: 1, withRequestBody: 0, withResponses: 0, withInputs: 0 });
  });

  it("counts zero for a draft with no untyped params and no wrapped handlers", () => {
    const markdown = buildApiMarkdown("o/r", "main", [route({ routePath: "/api/ping" })], new Map());
    expect(coverageSummaryFromMarkdown(markdown)).toEqual({ total: 1, untypedParams: 0, wrapped: 0, withRequestBody: 0, withResponses: 0, withInputs: 0 });
  });

  it("counts request-body facts from rendered Request body lines", () => {
    const routes = [
      route({
        routePath: "/api/tokens",
        method: "POST",
        requestBody: { source: "zod" as const, schemaName: "bodySchema", resolved: true, fields: [{ name: "name", type: "string", optional: false, constraints: [], typeResolved: true }] },
      }),
      route({ routePath: "/api/ping", method: "GET" }),
    ];
    const markdown = buildApiMarkdown("o/r", "main", routes, new Map());
    expect(coverageSummaryFromMarkdown(markdown)).toEqual({ total: 2, untypedParams: 0, wrapped: 0, withRequestBody: 1, withResponses: 0, withInputs: 0 });
  });

  it("counts response-shape facts from rendered Responses lines", () => {
    const routes = [
      route({
        routePath: "/api/ping",
        method: "GET",
        responses: [{ source: "literal" as const, fields: [{ name: "ok", type: "boolean", typeResolved: true }], resolved: true, status: 200 }],
      }),
      route({ routePath: "/api/pong", method: "GET" }),
    ];
    const markdown = buildApiMarkdown("o/r", "main", routes, new Map());
    expect(coverageSummaryFromMarkdown(markdown)).toEqual({ total: 2, untypedParams: 0, wrapped: 0, withRequestBody: 0, withResponses: 1, withInputs: 0 });
  });

  it("counts query/header input facts from rendered Query parameters and Headers lines", () => {
    const routes = [
      route({
        routePath: "/api/search",
        method: "GET",
        inputs: [{ kind: "query" as const, name: "q", nameResolved: true, typed: true, schemaName: "qs", type: "string", typeResolved: true, multi: false }],
      }),
      route({
        routePath: "/api/me",
        method: "GET",
        inputs: [{ kind: "header" as const, name: "authorization", nameResolved: true, typed: false, schemaName: null, type: "", typeResolved: false, multi: false }],
      }),
    ];
    const markdown = buildApiMarkdown("o/r", "main", routes, new Map());
    expect(coverageSummaryFromMarkdown(markdown)).toEqual({ total: 2, untypedParams: 0, wrapped: 0, withRequestBody: 0, withResponses: 0, withInputs: 2 });
  });

  it("returns all-zero for an empty draft (no endpoints heading)", () => {
    const markdown = buildApiMarkdown("o/r", "main", [], new Map());
    expect(coverageSummaryFromMarkdown(markdown)).toEqual({ total: 0, untypedParams: 0, wrapped: 0, withRequestBody: 0, withResponses: 0, withInputs: 0 });
  });

  it("does not count table rows or summary lines — only Reference detail lines", () => {
    const markdown = buildApiMarkdown(
      "o/r",
      "main",
      [
        route({
          routePath: "/api/a/[id]",
          method: "DELETE",
          dynamicSegments: ["id"],
          wrapped: true,
          wrappedVia: "withRouteErrors",
          params: [{ name: "params", type: "", kind: "url", typeResolved: false }],
        }),
      ],
      new Map(),
    );
    const summary = coverageSummaryFromMarkdown(markdown);
    // One parameter line + one wrapped line, despite the endpoint table also mentioning the path.
    expect(summary).toEqual({ total: 1, untypedParams: 1, wrapped: 1, withRequestBody: 0, withResponses: 0, withInputs: 0 });
  });

  it("never guesses on malformed markdown (all zeros)", () => {
    expect(coverageSummaryFromMarkdown("not a docloom draft")).toEqual({ total: 0, untypedParams: 0, wrapped: 0, withRequestBody: 0, withResponses: 0, withInputs: 0 });
    expect(coverageSummaryFromMarkdown("")).toEqual({ total: 0, untypedParams: 0, wrapped: 0, withRequestBody: 0, withResponses: 0, withInputs: 0 });
  });
});
