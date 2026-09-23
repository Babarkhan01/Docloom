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

/** One field of a validated request body (M1: zod only). */
export type RequestField = {
  name: string;
  /** Plain type derived from the zod chain as written ("string", "string[]", "enum: a | b"). Empty when unresolvable. */
  type: string;
  optional: boolean;
  /** Constraints exactly as written in source ("email", "max(50)", "refine(...)"). */
  constraints: string[];
  /** z.enum literal values, when the field is an enum. */
  enumValues?: string[];
  /** `.default(...)` value text as written. */
  defaultValue?: string;
  /** False when the field's type could not be resolved from source (never guessed). */
  typeResolved: boolean;
};

/**
 * The validated request body of a handler. Present only when the handler
 * provably parses the request body through a zod schema visible in the same
 * file; otherwise the property is undefined (nothing claimed).
 */
export type ParsedRequestBody = {
  /** "zod" — the only validator family understood today. */
  source: "zod";
  /** Schema identifier as written; null for inline `z.object(...).parse(...)` chains. */
  schemaName: string | null;
  fields: RequestField[];
  /** False when the field list is known to be incomplete or unresolvable (imported/dynamic schema). */
  resolved: boolean;
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
  /** Validated request body when provably extractable from this file; undefined/absent = nothing claimed. */
  requestBody?: ParsedRequestBody | null;
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
// Zod request-body extraction (M1) — same-file schemas only; everything
// unresolvable is reported as such, never guessed.
// ---------------------------------------------------------------------------

const ZOD_PRIMITIVE_TYPES: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  bigint: "bigint",
  date: "date",
  symbol: "symbol",
  any: "any",
  unknown: "unknown",
};

const ZOD_FLAG_CONSTRAINTS = new Set([
  "email", "url", "uuid", "cuid", "cuid2", "ulid", "nanoid", "emoji", "ip", "datetime", "time",
]);

const ZOD_ARG_CONSTRAINTS = new Set([
  "min", "max", "length", "int", "multipleOf", "regex", "startsWith", "endsWith", "includes", "gt", "gte", "lt", "lte",
]);

/**
 * Schema-level derivations whose result we cannot walk: extracting the base
 * object's fields would present an *incomplete* field list as complete
 * (`z.object({a}).extend({b})` would drop `b`). Such schemas stay named but
 * unresolved — never a partial list dressed up as the whole truth.
 */
const ZOD_SCHEMA_DERIVATIONS = new Set([
  "extend", "merge", "pick", "omit", "partial", "deepPartial", "passthrough", "strict",
  "strip", "refine", "superRefine", "transform", "catch", "brand", "lazy", "preprocess",
]);

/** Well-known globals that can never be zod schemas but expose `.parse` (JSON.parse). */
const NON_SCHEMA_IDENTIFIERS = new Set([
  "JSON", "Math", "Date", "Object", "Array", "URL", "URLSearchParams", "FormData",
  "Number", "String", "Boolean", "console", "window", "document", "crypto",
  "localStorage", "sessionStorage",
]);

/** Strip parentheses / `as T` / `as const` / `satisfies T` / non-null wrappers. */
function unwrapExpression(e: ts.Expression): ts.Expression {
  let cur = e;
  for (;;) {
    if (
      ts.isParenthesizedExpression(cur) ||
      ts.isAssertionExpression(cur) ||
      ts.isSatisfiesExpression(cur) ||
      ts.isNonNullExpression(cur)
    ) {
      cur = cur.expression;
      continue;
    }
    return cur;
  }
}

/**
 * Local names bound to the zod module (`import { z } from "zod"`, aliases and
 * namespace imports included). Only chains rooted in one of these count as
 * zod — a same-file `myQuery.string()` must never be typed as a zod string.
 */
function zodNamespaceNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/^zod(\/|$)/.test(st.moduleSpecifier.text)) continue;
    const clause = st.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    const b = clause.namedBindings;
    if (b) {
      if (ts.isNamespaceImport(b)) names.add(b.name.text);
      else for (const el of b.elements) names.add(el.name.text);
    }
  }
  return names;
}

/**
 * Unwrap `z.root().a().b(...)` into { root, ctorArgs, calls[], ns } (source
 * order). The chain terminates at the zod namespace — either a bare identifier
 * (`z`, `zod`, …) or the namespace side of a property chain (`z.coerce`), so
 * `z.coerce.number()` unwraps with root `number`. The first call in source
 * order is the constructor. `ns` is the namespace identifier text, used to
 * verify the chain actually comes from the zod module the file imports.
 */
function flattenZodChain(e: ts.Expression): { root: string; ctorArgs: ts.Expression[]; calls: { name: string; args: ts.Expression[] }[]; ns: string } | null {
  const raw: { name: string; args: ts.Expression[] }[] = [];
  let cur: ts.Node = e;
  let ns: string | null = null;
  for (;;) {
    if (ts.isCallExpression(cur)) {
      if (!ts.isPropertyAccessExpression(cur.expression)) return null;
      raw.push({ name: cur.expression.name.text, args: [...cur.arguments] });
      cur = cur.expression.expression;
      continue;
    }
    if (ts.isIdentifier(cur)) {
      ns = cur.text;
      break;
    }
    // Terminal namespace property: `z.coerce` at the end of `z.coerce.number()`.
    if (ts.isPropertyAccessExpression(cur) && ts.isIdentifier(cur.expression)) {
      ns = cur.expression.text;
      break;
    }
    return null;
  }
  const ordered = raw.slice().reverse(); // source order (constructor first)
  if (!ns || ordered.length === 0) return null;
  return { root: ordered[0].name, ctorArgs: ordered[0].args, calls: ordered.slice(1), ns };
}

/**
 * Same-file zod schema definitions, by identifier (never crosses files).
 * Only chains rooted in a zod namespace are stored, so `myQuery.string()`
 * cannot masquerade as a schema. Aliases (`const b = a`) are stored too —
 * resolution chases them one hop at a time with a depth bound, and the
 * final chain is namespace-checked at use time, so non-zod aliases fail
 * honestly instead of fabricating types.
 */
function localZodSchemas(sf: ts.SourceFile, zodNs: Set<string>): Map<string, ts.Expression> {
  const map = new Map<string, ts.Expression>();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      if (ts.isIdentifier(n.initializer)) {
        map.set(n.name.text, n.initializer);
      } else {
        const chain = flattenZodChain(n.initializer);
        if (chain && zodNs.has(chain.ns)) map.set(n.name.text, n.initializer);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return map;
}

/**
 * Type text for a zod schema expression, honest by construction: known roots
 * map to plain names, everything else (including identifiers that resolve to
 * imported schemas) comes back unresolved. One-hop identifier resolution
 * through same-file schema definitions; depth-bounded against cycles.
 */
function zodFieldType(
  expr: ts.Expression,
  sf: ts.SourceFile,
  schemaMap: Map<string, ts.Expression>,
  depth: number,
  zodNs: Set<string>,
): { type: string; typeResolved: boolean; enumValues?: string[] } {
  if (depth > 3) return { type: "", typeResolved: false };
  if (ts.isIdentifier(expr)) {
    const def = schemaMap.get(expr.text);
    if (def) return zodFieldType(def, sf, schemaMap, depth + 1, zodNs);
    // Imported/unknown schema: keep the name as written, mark unresolved.
    return { type: "", typeResolved: false };
  }
  const chain = flattenZodChain(expr);
  // Not provably zod (e.g. `myQuery.string()`): never attribute a type.
  if (!chain || !zodNs.has(chain.ns)) return { type: "", typeResolved: false };
  switch (chain.root) {
    case "enum": {
      // Accept both z.enum(["a","b"]) and the (unusual) direct-args form.
      const vals = chain.ctorArgs.flatMap((a) =>
        ts.isArrayLiteralExpression(a)
          ? a.elements.filter(ts.isStringLiteral).map((s) => s.text)
          : ts.isStringLiteral(a)
            ? [a.text]
            : [],
      );
      return {
        type: vals.length ? `enum: ${vals.join(" | ")}` : "enum",
        typeResolved: vals.length > 0,
        enumValues: vals.length ? vals : undefined,
      };
    }
    case "literal":
      return {
        type: chain.ctorArgs.length ? `literal: ${clean(chain.ctorArgs[0].getText(sf))}` : "",
        typeResolved: chain.ctorArgs.length > 0,
      };
    case "array": {
      const el = chain.ctorArgs[0]
        ? zodFieldType(chain.ctorArgs[0], sf, schemaMap, depth + 1, zodNs)
        : { type: "", typeResolved: false };
      return { type: el.typeResolved && el.type ? `${el.type}[]` : "array", typeResolved: el.typeResolved && Boolean(el.type) };
    }
    case "object":
      return { type: "object", typeResolved: true };
    case "record":
      return { type: "record", typeResolved: true };
    case "union":
    case "discriminatedUnion":
      return { type: "union", typeResolved: true };
    case "intersection":
      return { type: "intersection", typeResolved: true };
    default:
      if (ZOD_PRIMITIVE_TYPES[chain.root]) return { type: ZOD_PRIMITIVE_TYPES[chain.root], typeResolved: true };
      return { type: "", typeResolved: false };
  }
}

/** Build one RequestField from a property initializer (name assigned by caller). */
function requestFieldFromInitializer(
  init: ts.Expression,
  sf: ts.SourceFile,
  schemaMap: Map<string, ts.Expression>,
  zodNs: Set<string>,
): RequestField {
  const constraints: string[] = [];
  let optional = false;
  let defaultValue: string | undefined;
  const chain = flattenZodChain(init);
  if (chain) {
    for (const call of chain.calls) {
      if (call.name === "optional") {
        optional = true;
      } else if (call.name === "nullable") {
        constraints.push("nullable");
      } else if (call.name === "nullish") {
        optional = true;
        constraints.push("nullable");
      } else if (call.name === "default" && call.args.length > 0) {
        defaultValue = clean(call.args[0].getText(sf));
      } else if (ZOD_FLAG_CONSTRAINTS.has(call.name)) {
        constraints.push(call.name);
      } else if (ZOD_ARG_CONSTRAINTS.has(call.name)) {
        constraints.push(
          call.args.length
            ? `${call.name}(${clean(call.args.map((a) => a.getText(sf)).join(", "))})`
            : call.name,
        );
      } else if (call.name === "refine" || call.name === "superRefine" || call.name === "transform") {
        constraints.push(`${call.name}(...)`);
      }
    }
  }
  const t = zodFieldType(init, sf, schemaMap, 1, zodNs);
  return {
    name: "",
    type: t.type,
    optional,
    constraints,
    enumValues: t.enumValues,
    defaultValue,
    typeResolved: t.typeResolved,
  };
}

/** Walk a z.object literal into fields; `complete=false` when any part is opaque (spreads, computed keys). */
function fieldsFromZodObject(
  obj: ts.Expression,
  sf: ts.SourceFile,
  schemaMap: Map<string, ts.Expression>,
  zodNs: Set<string>,
): { fields: RequestField[]; complete: boolean } {
  if (!ts.isObjectLiteralExpression(obj)) return { fields: [], complete: false };
  const fields: RequestField[] = [];
  let complete = true;
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      complete = false; // spread/computed/method — field list would be incomplete
      continue;
    }
    const name = ts.isIdentifier(prop.name)
      ? prop.name.text
      : ts.isStringLiteral(prop.name)
        ? prop.name.text
        : ts.isNumericLiteral(prop.name)
          ? prop.name.text
          : null;
    if (!name) {
      complete = false;
      continue;
    }
    const field = requestFieldFromInitializer(prop.initializer, sf, schemaMap, zodNs);
    fields.push({ ...field, name });
  }
  return { fields, complete };
}

/**
 * Identifiers assigned the request body anywhere in the file:
 * `const x = await req.json()` and the cast-heavy real-world variants —
 * `const x = (await req.json()) as Foo`, `const x = await req.json() as Foo`
 * (cal.com chains `as unknown as T`). Wrappers are stripped before matching.
 */
function jsonBodyVariableNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const awaited = unwrapExpression(n.initializer);
      if (ts.isAwaitExpression(awaited)) {
        const inner = unwrapExpression(awaited.expression);
        if (
          ts.isCallExpression(inner) &&
          ts.isPropertyAccessExpression(inner.expression) &&
          inner.expression.name.text === "json" &&
          ts.isIdentifier(inner.expression.expression) &&
          (inner.expression.expression.text === "req" || inner.expression.expression.text === "request")
        ) {
          names.add(n.name.text);
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

/** True when the expression contains a `.json()` call on `req`/`request`. */
function readsRequestJson(node: ts.Node | undefined): boolean {
  if (!node) return false;
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "json" &&
      ts.isIdentifier(n.expression.expression) &&
      (n.expression.expression.text === "req" || n.expression.expression.text === "request")
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

/**
 * Build the body fact from a schema expression; non-object schemas stay
 * honest (no fields). Identifier aliases are chased (depth-bounded) so
 * `const b = a` resolves to a's object literal.
 */
function buildRequestBody(
  schemaExprIn: ts.Expression,
  schemaName: string | null,
  sf: ts.SourceFile,
  schemaMap: Map<string, ts.Expression>,
  zodNs: Set<string>,
): ParsedRequestBody {
  let schemaExpr = schemaExprIn;
  for (let depth = 0; ts.isIdentifier(schemaExpr) && depth < 5; depth++) {
    const next = schemaMap.get(schemaExpr.text);
    if (!next) break;
    schemaExpr = next;
  }
  const chain = flattenZodChain(schemaExpr);
  const derived = chain ? chain.calls.some((c) => ZOD_SCHEMA_DERIVATIONS.has(c.name)) : false;
  if (chain && zodNs.has(chain.ns) && !derived && chain.root === "object" && chain.ctorArgs[0]) {
    const { fields, complete } = fieldsFromZodObject(chain.ctorArgs[0], sf, schemaMap, zodNs);
    return { source: "zod", schemaName, fields, resolved: complete };
  }
  // Unions / derived / dynamic schemas: named honestly, fields not claimed.
  return { source: "zod", schemaName, fields: [], resolved: false };
}

/**
 * Whether a parse-callee base is provably in the zod family (or may plausibly
 * be one). Chains are checked against the file's zod imports; identifiers are
 * chased through same-file aliases, with well-known globals (JSON.parse)
 * excluded outright. Unknown identifiers stay candidates — they may be
 * imported zod schemas, which are reported as named gaps, never dropped.
 */
function zodRooted(expr: ts.Expression, schemaMap: Map<string, ts.Expression>, zodNs: Set<string>): boolean {
  let cur: ts.Expression = expr;
  for (let depth = 0; depth < 5; depth++) {
    if (ts.isIdentifier(cur)) {
      if (NON_SCHEMA_IDENTIFIERS.has(cur.text)) return false;
      const next = schemaMap.get(cur.text);
      if (!next) return true;
      cur = next;
      continue;
    }
    const chain = flattenZodChain(cur);
    return Boolean(chain && zodNs.has(chain.ns));
  }
  return true;
}

const BODY_PARSE_METHODS = new Set(["parse", "safeParse"]);

/**
 * Find the handler's zod body validation. Matched only when a `.parse()`/
 * `.safeParse()` call provably consumes the request json (inline
 * `req.json()` or a one-hop `const x = await req.json()` variable).
 * Zero matches → null (nothing claimed); multiple matches → an unresolved
 * fact (ambiguous which schema is THE body); imported schema → named gap.
 */
function extractRequestBody(
  fn: ts.FunctionLikeDeclaration,
  sf: ts.SourceFile,
  schemaMap: Map<string, ts.Expression>,
  jsonVars: Set<string>,
  zodNs: Set<string>,
): ParsedRequestBody | null {
  if (!fn.body) return null;
  const bases: ts.Expression[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && BODY_PARSE_METHODS.has(n.expression.name.text)) {
      const arg = n.arguments[0];
      // Cast-wrapped json vars count too: `schema.parse(body as T)`.
      const jsonArg = unwrapExpression(arg);
      const consumesBody = readsRequestJson(arg) || (ts.isIdentifier(jsonArg) && jsonVars.has(jsonArg.text));
      const base = n.expression.expression;
      if (consumesBody && zodRooted(base, schemaMap, zodNs)) bases.push(base);
    }
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  // parse + safeParse (or repeated branches) on the SAME schema expression is
  // one body fact, not an ambiguity; only distinct schema expressions are.
  const uniq: ts.Expression[] = [];
  const seen = new Set<string>();
  for (const b of bases) {
    const key = b.getText(sf);
    if (!seen.has(key)) {
      seen.add(key);
      uniq.push(b);
    }
  }
  if (uniq.length === 0) return null;
  if (uniq.length > 1) return { source: "zod", schemaName: null, fields: [], resolved: false };
  const base = uniq[0];
  if (ts.isIdentifier(base)) {
    const def = schemaMap.get(base.text);
    if (!def) return { source: "zod", schemaName: base.text, fields: [], resolved: false };
    return buildRequestBody(def, base.text, sf, schemaMap, zodNs);
  }
  if (flattenZodChain(base)) return buildRequestBody(base, null, sf, schemaMap, zodNs);
  return { source: "zod", schemaName: null, fields: [], resolved: false };
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
  const zodNs = zodNamespaceNames(sf);
  const zodSchemas = localZodSchemas(sf, zodNs);
  const jsonVars = jsonBodyVariableNames(sf);

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
      const body = extractRequestBody(direct.fn, sf, zodSchemas, jsonVars, zodNs);
      routes.push({
        filePath,
        routePath,
        method: direct.method,
        dynamicSegments: dyn,
        params: paramsForHandler(direct.fn, sf, true),
        hasRequestUsage: usesRequest(direct.fn),
        returnsResponse: returnsResponse(direct.fn),
        jsdoc: leadingJSDoc(direct.fn, sf),
        ...(body ? { requestBody: body } : {}),
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
            const body = extractRequestBody(fn, sf, zodSchemas, jsonVars, zodNs);
            routes.push({
              filePath,
              routePath,
              method: d.name.text,
              dynamicSegments: dyn,
              params: paramsForHandler(fn, sf, false),
              hasRequestUsage: usesRequest(fn),
              returnsResponse: returnsResponse(fn),
              jsdoc: leadingJSDoc(fn, sf),
              ...(body ? { requestBody: body } : {}),
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
