/**
 * AST-based extraction of Next.js API route facts using the TypeScript
 * compiler API (per PRD: structural facts come from a real parser, never
 * from the LLM). Self-contained: only imports `typescript`, so it can be
 * exercised from scripts directly.
 *
 * What it extracts per route.ts file:
 *  - the URL path (from the file path, handling route groups)
 *  - exported HTTP method handlers (GET/POST/...) and other exports
 *  - second-argument shape (params) when resolvable — inline object types,
 *    local type aliases, or local interfaces
 *  - handler parameters, even when the export is a *wrapped* handler
 *    (`export const GET = withAuth(async ({ params }) => {...})` or
 *    `export const GET = responder(handler)` with a same-file `handler`),
 *    tagged with where each param comes from (url vs handler context) and
 *    whether its type could be resolved (never guessed)
 *  - whether the handler reads the request, and whether it returns a Response
 *  - leading JSDoc, which grounds the AI's prose later
 *
 * What it deliberately does NOT do: cross-file resolution. A wrapped export
 * whose handler cannot be resolved in the same file is reported in
 * diagnostics (`wrappedOpaque`), never dropped silently and never guessed.
 */
import ts from "typescript";

export type ParsedParam = {
  name: string;
  /** Resolved type text. Empty string when the type could not be determined (never guessed). */
  type: string;
  /** Where the param comes from: url = route/dynamic params, context = handler-provided context. */
  kind: "url" | "context";
  /** False when we know the name but could not resolve a type from source. */
  typeResolved: boolean;
};

export type ParsedRoute = {
  filePath: string;
  routePath: string;
  method: string | null;
  dynamicSegments: string[];
  params: ParsedParam[];
  hasRequestUsage: boolean;
  returnsResponse: boolean;
  jsdoc: string | null;
  exportedSymbols: string[];
  /** True when the export resolves through a wrapper call (`export const GET = wrapper(...)`). */
  wrapped?: boolean;
  /** The wrapper's name as written (e.g. `withWorkspace`), when wrapped. */
  wrappedVia?: string;
};

/** Per-file facts the parser could see but not resolve — never dropped silently. */
export type RouteFileDiagnostics = {
  /** Exported method handlers whose handler function could not be resolved (e.g. imported from another file). */
  wrappedOpaque: { method: string; filePath: string }[];
};

export type RouteFileResult = { routes: ParsedRoute[]; diagnostics: RouteFileDiagnostics };

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** "src/app/api/repos/[id]/route.ts" -> "/api/repos/[id]" */
export function routePathFromFilePath(p: string): string {
  let s = p.replace(/\\/g, "/");
  const appIdx = s.lastIndexOf("app/");
  s = appIdx >= 0 ? s.slice(appIdx + 4) : s;
  s = s.replace(/\/route\.(ts|tsx|js|jsx)$/, "");
  s = "/" + s.replace(/^\/+/, "");
  // Route groups (parenthesized) don't appear in URLs.
  s = s.replace(/\/\([^/]+\)/g, "");
  return s;
}

function dynamicSegments(routePath: string): string[] {
  return [...routePath.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Parse a type-literal-ish text ("{ params: Promise<{ id: string }> }") into members. */
function extractMembersFromTypeText(text: string): ParsedParam[] {
  let t = text.trim();
  if (!t.startsWith("{")) return [];
  if (!t.endsWith("}")) t += "}";
  const src = ts.createSourceFile("__probe.ts", `type __DocloomProbe = ${t};`, ts.ScriptTarget.Latest, true);
  const out: ParsedParam[] = [];
  ts.forEachChild(src, (st) => {
    if (
      ts.isTypeAliasDeclaration(st) &&
      st.name.text === "__DocloomProbe" &&
      ts.isTypeLiteralNode(st.type)
    ) {
      for (const m of st.type.members) {
        if (ts.isPropertySignature(m) && m.name && m.type) {
          out.push({ name: m.name.getText(src), type: clean(m.type.getText(src)), kind: "url", typeResolved: true });
        }
      }
    }
  });
  return out;
}

/** One-hop resolution of a type name to a local alias/interface in the same file. */
function resolveLocalTypeText(typeName: string, sf: ts.SourceFile): string | null {
  for (const st of sf.statements) {
    if (
      (ts.isTypeAliasDeclaration(st) || ts.isInterfaceDeclaration(st)) &&
      st.name.text === typeName
    ) {
      return clean(st.getText(sf));
    }
  }
  return null;
}

/**
 * Shape of the Next.js route-context argument (conventionally the handler's
 * second parameter). Members keep the type text exactly as written; kinds are
 * labeled `url` (they are the URL-derived params).
 */
function extractContextParams(
  fn: ts.FunctionLikeDeclaration,
  sf: ts.SourceFile,
  kind: "url" | "context" = "url",
): ParsedParam[] {
  if (fn.parameters.length < 2) return [];
  const p = fn.parameters[1];
  if (!p.type) return p.name.getText(sf) ? [{ name: p.name.getText(sf), type: "", kind, typeResolved: false }] : [];
  const text = clean(p.type.getText(sf));

  if (text.startsWith("{")) {
    const members = extractMembersFromTypeText(text);
    if (members.length) return members.map((m) => ({ ...m, kind }));
  }
  if (ts.isTypeReferenceNode(p.type)) {
    const typeName = p.type.typeName.getText(sf);
    const resolved = resolveLocalTypeText(typeName, sf);
    if (resolved) {
      const brace = resolved.indexOf("{");
      if (brace >= 0) {
        const members = extractMembersFromTypeText(resolved.slice(brace));
        if (members.length) return members.map((m) => ({ ...m, kind }));
      }
    }
    // Imported/unresolvable type: keep the accurate name, nothing invented.
    return [{ name: p.name.getText(sf), type: typeName, kind, typeResolved: true }];
  }
  return [{ name: p.name.getText(sf), type: text, kind, typeResolved: true }];
}

/**
 * Params from the handler's first parameter. Destructured bindings
 * (`async ({ workspace, params }) => ...`) yield names without types —
 * typeResolved=false, rendered as "not documented in source" downstream.
 */
function paramsFromFirstArg(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): ParsedParam[] {
  const p = fn.parameters[0];
  // Only destructured context objects carry params we can name honestly; a
  // plain `(req)` param is the request itself, not route context.
  if (!p || !ts.isObjectBindingPattern(p.name)) return [];
  return p.name.elements.flatMap((e) => {
    if (!ts.isIdentifier(e.name)) return [];
    const name = e.propertyName
      ? ts.isIdentifier(e.propertyName)
        ? e.propertyName.text
        : e.propertyName.getText(sf)
      : e.name.text;
    return [
      {
        name,
        type: "",
        kind: e.name.text === "params" ? ("url" as const) : ("context" as const),
        typeResolved: false,
      },
    ];
  });
}

/**
 * All params we can honestly report for a resolved handler function.
 * Direct Next handlers keep the classic first=request / second=context read;
 * wrapped handlers usually take a single destructured context object.
 */
function paramsForHandler(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile, isDirect: boolean): ParsedParam[] {
  // Direct Next handlers: classic first=request / second=context signature.
  // Single-argument handlers report no params (the request arg is not route
  // context) — same as before wrapped-handler support existed.
  if (isDirect) return fn.parameters.length >= 2 ? extractContextParams(fn, sf, "url") : [];
  // Wrapped handlers: destructured context object on the first argument
  // (e.g. `withWorkspace(async ({ workspace, params }) => ...)`).
  const out = paramsFromFirstArg(fn, sf);
  if (out.length === 0 && fn.parameters.length >= 2) {
    const p1 = fn.parameters[1];
    const looksLikeNextContext = p1.type ? clean(p1.type.getText(sf)).includes("params") : false;
    out.push(...extractContextParams(fn, sf, looksLikeNextContext ? "url" : "context"));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Wrapped-handler resolution (export const GET = wrapper(...))
// ---------------------------------------------------------------------------

function isFunctionLikeNode(n: ts.Node): n is ts.FunctionLikeDeclaration {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isArrowFunction(n) ||
    ts.isFunctionExpression(n) ||
    ts.isMethodDeclaration(n)
  );
}

/** First function-like node under `root`, breadth-first (outermost wins). */
function firstFunctionLikeBfs(root: ts.Node): ts.FunctionLikeDeclaration | null {
  const queue: ts.Node[] = [root];
  while (queue.length) {
    const n = queue.shift() as ts.Node;
    if (isFunctionLikeNode(n)) return n;
    // Block body on purpose: forEachChild short-circuits when the callback
    // returns a truthy value, so the callback MUST return undefined.
    ts.forEachChild(n, (c) => {
      queue.push(c);
    });
  }
  return null;
}

/** Same-file function-like declarations, by name (never crosses files). */
function localFunctionDeclarations(sf: ts.SourceFile): Map<string, ts.FunctionLikeDeclaration> {
  const map = new Map<string, ts.FunctionLikeDeclaration>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) map.set(st.name.text, st);
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))
        ) {
          map.set(d.name.text, d.initializer);
        }
      }
    }
  }
  return map;
}

/**
 * Resolve the handler function behind a wrapper call, strongest evidence
 * first: (1) an inline function passed as an argument, (2) a same-file
 * function/const referenced by name in the arguments, (3) the first
 * function-like anywhere in the initializer expression. Returns null when
 * none is found — the export is then reported as opaque, never guessed.
 */
function resolveWrappedHandler(
  init: ts.CallExpression,
  locals: Map<string, ts.FunctionLikeDeclaration>,
): ts.FunctionLikeDeclaration | null {
  for (const arg of init.arguments) {
    if (isFunctionLikeNode(arg)) return arg;
    if (ts.isIdentifier(arg)) {
      const local = locals.get(arg.text);
      if (local) return local;
    }
  }
  return firstFunctionLikeBfs(init);
}

// ---------------------------------------------------------------------------
// Handler facts
// ---------------------------------------------------------------------------

function handlerFromNode(
  node: ts.Node,
): { fn: ts.FunctionLikeDeclaration; method: string } | null {
  let fn: ts.FunctionLikeDeclaration | null = null;
  let name: string | null = null;

  if (ts.isFunctionDeclaration(node) && node.name) {
    fn = node;
    name = node.name.text;
  } else if (ts.isVariableStatement(node)) {
    for (const d of node.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer) {
        const init = d.initializer;
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          fn = init;
          name = d.name.text;
        }
      }
    }
  }
  if (!fn || !name || !HTTP_METHODS.has(name)) return null;
  return { fn, method: name };
}

function usesRequest(fn: ts.FunctionLikeDeclaration): boolean {
  if (!fn.body) return false;
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(n) && (n.text === "request" || n.text === "req")) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  return found;
}

function returnsResponse(fn: ts.FunctionLikeDeclaration): boolean {
  const explicit = fn.type ? /Response|NextResponse/.test(fn.type.getText()) : false;
  if (explicit || !fn.body) return explicit;
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isReturnStatement(n) && n.expression && /Response|NextResponse/.test(n.expression.getText())) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  return found;
}

function leadingJSDoc(fn: ts.FunctionLikeDeclaration, sf: ts.SourceFile): string | null {
  const m = fn.getFullText(sf).match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return null;
  const lines = m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*\*\s?/, "").trim())
    .filter(Boolean);
  return lines.length ? lines.join("\n") : null;
}

// ---------------------------------------------------------------------------
// File parsing
// ---------------------------------------------------------------------------

/** Parse one Next.js route file's contents into its handler facts + diagnostics. */
export function parseRouteFileWithDiagnostics(filePath: string, content: string): RouteFileResult {
  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const routePath = routePathFromFilePath(filePath);
  const dyn = dynamicSegments(routePath);
  const exportedSymbols: string[] = [];
  const routes: ParsedRoute[] = [];
  const diagnostics: RouteFileDiagnostics = { wrappedOpaque: [] };
  const locals = localFunctionDeclarations(sf);

  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? st.modifiers : undefined;
    const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;

    let exportedName: string | null = null;
    if (ts.isFunctionDeclaration(st) && st.name) exportedName = st.name.text;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (isExported && ts.isIdentifier(d.name)) exportedName = d.name.text;
      }
    }
    if (isExported && exportedName) exportedSymbols.push(exportedName);

    // Direct style: `export async function GET(...)` / `export const GET = async (...) => ...`
    const direct = handlerFromNode(st);
    if (direct) {
      routes.push({
        filePath,
        routePath,
        method: direct.method,
        dynamicSegments: dyn,
        params: paramsForHandler(direct.fn, sf, true),
        hasRequestUsage: usesRequest(direct.fn),
        returnsResponse: returnsResponse(direct.fn),
        jsdoc: leadingJSDoc(direct.fn, sf),
        exportedSymbols,
      });
      continue;
    }

    // Wrapped style: `export const GET = wrapper(...)` (or any other initializer
    // we cannot resolve into a handler function).
    if (ts.isVariableStatement(st) && isExported) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !HTTP_METHODS.has(d.name.text) || !d.initializer) continue;
        if (ts.isCallExpression(d.initializer)) {
          const fn = resolveWrappedHandler(d.initializer, locals);
          if (fn) {
            routes.push({
              filePath,
              routePath,
              method: d.name.text,
              dynamicSegments: dyn,
              params: paramsForHandler(fn, sf, false),
              hasRequestUsage: usesRequest(fn),
              returnsResponse: returnsResponse(fn),
              jsdoc: leadingJSDoc(fn, sf),
              exportedSymbols,
              wrapped: true,
              wrappedVia: clean(d.initializer.expression.getText(sf)),
            });
            continue;
          }
        }
        // Unresolvable (e.g. handler imported from another file): reported, not guessed.
        diagnostics.wrappedOpaque.push({ method: d.name.text, filePath });
      }
    }
  }
  return { routes, diagnostics };
}

/** Back-compat wrapper: routes only. */
export function parseRouteFile(filePath: string, content: string): ParsedRoute[] {
  return parseRouteFileWithDiagnostics(filePath, content).routes;
}

export function parseRouteFilesWithDiagnostics(files: { path: string; content: string }[]): RouteFileResult {
  const routes: ParsedRoute[] = [];
  const diagnostics: RouteFileDiagnostics = { wrappedOpaque: [] };
  for (const f of files) {
    const res = parseRouteFileWithDiagnostics(f.path, f.content);
    routes.push(...res.routes);
    diagnostics.wrappedOpaque.push(...res.diagnostics.wrappedOpaque);
  }
  return { routes, diagnostics };
}

/** Back-compat wrapper: routes only. */
export function parseRouteFiles(files: { path: string; content: string }[]): ParsedRoute[] {
  return parseRouteFilesWithDiagnostics(files).routes;
}

/**
 * Detect when a repo's HTTP layer is built on a framework Docloom does not
 * parse (Express / Fastify / NestJS). Evidence-based and cheap: distinctive
 * filenames (.controller.ts/.module.ts), decorators, and route-registration
 * calls — the same signals a human greps for. Scores count total matches
 * across files (threshold 3) so one stray helper cannot trigger a note.
 * The result is only ever used to say "not documented in source" honestly;
 * nothing is inferred beyond that.
 */
export function detectUnsupportedFramework(
  files: { path: string; content: string }[],
): string | null {
  let express = 0;
  let fastify = 0;
  let nest = 0;
  for (const f of files) {
    // Distinctive NestJS filenames are strong evidence on their own.
    if (/\.(?:controller|module)\.ts$/.test(f.path)) nest += 2;
    nest += (f.content.match(/@(?:Controller|Get|Post|Put|Patch|Delete|All)\s*\(/g) ?? []).length;
    express += (f.content.match(/\b(?:app|router)\s*\.\s*(?:get|post|put|patch|delete|all)\s*\(\s*["'`]/g) ?? []).length;
    fastify += (f.content.match(/\b(?:fastify|server)\s*\.\s*(?:get|post|put|patch|delete|route)\s*\(\s*["'`]/g) ?? []).length;
  }
  if (nest >= 3) return "NestJS";
  if (express >= 3) return "Express";
  if (fastify >= 3) return "Fastify";
  return null;
}
