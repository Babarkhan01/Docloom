import type { Metadata } from "next";
import { ComparisonPage, type ComparisonRow, type ComparisonSection } from "@/components/comparison-page";

export const metadata: Metadata = {
  title: "Generate OpenAPI from Zod",
  description:
    "Can Zod schemas be turned into an OpenAPI document? Yes, with a dedicated library. How that compares with Docloom, which reads your route handlers and Zod schemas to write a hosted API reference.",
  alternates: { canonical: "/generate-openapi-from-zod" },
};

const ROWS: ComparisonRow[] = [
  {
    dimension: "Goal",
    docloom: "A readable API reference for developers, kept in step with the code.",
    other: "A machine-readable OpenAPI 3 document.",
  },
  {
    dimension: "Input",
    docloom: "Next.js route handlers plus their Zod schemas, parsed with the TypeScript compiler.",
    other: "Your Zod schemas, registered with the library's registry/extension API.",
  },
  {
    dimension: "Output",
    docloom: "A hosted markdown reference: endpoints, bodies, responses, query and header inputs.",
    other: "An OpenAPI 3 document (JSON or YAML).",
  },
  {
    dimension: "Where Zod sits",
    docloom: "Detected on your routes (same file, plus one import hop).",
    other: "Each schema is registered explicitly with the generator.",
  },
  {
    dimension: "Consumers",
    docloom: "People reading API docs.",
    other: "SDK generators, gateways, mock servers, Swagger UI and ReDoc.",
  },
  {
    dimension: "Gaps",
    docloom: "Unresolvable fields render as “not documented in source”.",
    other: "Unregistered schemas simply do not appear in the spec.",
  },
];

const SECTIONS: ComparisonSection[] = [
  {
    heading: "What actually generates OpenAPI from Zod",
    body: "Libraries such as @asteasolutions/zod-to-openapi and zod-openapi take Zod schemas and emit an OpenAPI document. They ask you to register each schema and attach OpenAPI metadata — paths, methods, response codes — to it. That produces a precise, machine-readable spec, which is exactly what you want when you need code generation or gateway support.",
  },
  {
    heading: "What Docloom does instead",
    body: "Docloom reads your Next.js App Router route handlers with the TypeScript compiler, resolves the Zod schemas they use, and writes a human-readable API reference over those facts. It does not emit OpenAPI, and it is explicit about that difference.",
  },
  {
    heading: "Which should you use?",
    body: "If you need OpenAPI for machine consumers, use a Zod-to-OpenAPI library. If you need a reference that tracks your handlers without hand-maintained schema registrations, Docloom is built for that. Teams that need both routinely run both — an OpenAPI document for tooling, a generated reference for people.",
  },
];

export default function GenerateOpenApiFromZodPage() {
  return (
    <ComparisonPage
      eyebrow="Guide"
      title="Generate OpenAPI from Zod"
      otherLabel="Zod-to-OpenAPI libraries"
      intro="A common question: can Zod schemas be turned into an OpenAPI document? Yes — with a dedicated library. This page is factual about what those libraries do, how they differ from Docloom, and which one fits your goal. Docloom is not an OpenAPI generator."
      rows={ROWS}
      sections={SECTIONS}
      ctaId="openapi_from_zod_playground"
    />
  );
}
