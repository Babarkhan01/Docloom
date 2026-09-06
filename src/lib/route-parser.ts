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
 *  - whether the handler reads the request, and whether it returns a Response
 *  - leading JSDoc, which grounds the AI's prose later
 */
import ts from "typescript";

export type ParsedParam = { name: string; type: string };

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
};

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
          out.push({ name: m.name.getText(src), type: clean(m.type.getText(src)) });
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

/** Shape of the handler's second argument (Next.js route context). */
function extractContextParams(
  fn: ts.FunctionLikeDeclaration,
  sf: ts.SourceFile,
): ParsedParam[] {
  if (fn.parameters.length < 2) return [];
  const p = fn.parameters[1];
  if (!p.type) return [];
  const text = clean(p.type.getText(sf));

  if (text.startsWith("{")) {
    const members = extractMembersFromTypeText(text);
    if (members.length) return members;
  }
  if (ts.isTypeReferenceNode(p.type)) {
    const typeName = p.type.typeName.getText(sf);
    const resolved = resolveLocalTypeText(typeName, sf);
    if (resolved) {
      const brace = resolved.indexOf("{");
      if (brace >= 0) {
        const members = extractMembersFromTypeText(resolved.slice(brace));
        if (members.length) return members;
      }
    }
    // Imported/unresolvable type: keep the accurate name, nothing invented.
    return [{ name: p.name.getText(sf), type: typeName }];
  }
  return [{ name: p.name.getText(sf), type: text }];
}

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

/** Parse one Next.js route file's contents into its handler facts. */
export function parseRouteFile(filePath: string, content: string): ParsedRoute[] {
  const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const routePath = routePathFromFilePath(filePath);
  const dyn = dynamicSegments(routePath);
  const exportedSymbols: string[] = [];
  const routes: ParsedRoute[] = [];

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

    const handler = handlerFromNode(st);
    if (!handler) continue;

    routes.push({
      filePath,
      routePath,
      method: handler.method,
      dynamicSegments: dyn,
      params: extractContextParams(handler.fn, sf),
      hasRequestUsage: usesRequest(handler.fn),
      returnsResponse: returnsResponse(handler.fn),
      jsdoc: leadingJSDoc(handler.fn, sf),
      exportedSymbols,
    });
  }
  return routes;
}

export function parseRouteFiles(files: { path: string; content: string }[]): ParsedRoute[] {
  return files.flatMap((f) => parseRouteFile(f.path, f.content));
}
