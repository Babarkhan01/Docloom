import type { Metadata } from "next";
import { ComparisonPage, type ComparisonRow, type ComparisonSection } from "@/components/comparison-page";

export const metadata: Metadata = {
  title: "Next-swagger-doc alternative: AST docs vs JSDoc annotations",
  description:
    "How Docloom compares with next-swagger-doc: next-swagger-doc emits an OpenAPI document from JSDoc annotations; Docloom generates a hosted API reference from your route handlers and Zod schemas.",
  alternates: { canonical: "/vs/next-swagger-doc" },
};

const ROWS: ComparisonRow[] = [
  {
    dimension: "Input",
    docloom: "Your route handlers and the Zod schemas they use, parsed with the TypeScript compiler.",
    other: "JSDoc / annotation comments you add to each handler.",
  },
  {
    dimension: "Output",
    docloom: "A hosted markdown API reference: endpoints, request bodies, response shapes, query and header inputs.",
    other: "An OpenAPI 3 document (JSON), typically rendered with Swagger UI or ReDoc.",
  },
  {
    dimension: "Spec format",
    docloom: "Not OpenAPI — a readable reference document for developers.",
    other: "OpenAPI 3, usable by client generators, gateways, mock servers and existing Swagger tooling.",
  },
  {
    dimension: "Descriptions",
    docloom: "AI-written on top of the parsed structure; anything unprovable is marked “not documented in source”.",
    other: "Whatever you wrote in the annotations.",
  },
  {
    dimension: "Hosting",
    docloom: "Published to a docs site on your subdomain, regenerated on merge.",
    other: "You host and render the spec yourself.",
  },
  {
    dimension: "Maintenance",
    docloom: "Re-reads the source each run; there are no annotations to keep in sync.",
    other: "Annotations have to stay in step with the handlers by hand.",
  },
];

const SECTIONS: ComparisonSection[] = [
  {
    heading: "When next-swagger-doc is the better fit",
    body: "If you need a machine-readable OpenAPI document — for client SDK generation, an API gateway, mock servers, or existing Swagger/ReDoc tooling — an OpenAPI generator is the right choice. It also fits teams that already maintain JSDoc annotations and want exact control over every description in the spec.",
  },
  {
    heading: "When Docloom is the better fit",
    body: "If the goal is a readable API reference that stays in step with the code without hand-maintained annotations, Docloom parses the handlers and their Zod schemas directly and writes descriptions over that structure. Fields it cannot resolve are marked “not documented in source” rather than guessed at.",
  },
  {
    heading: "Can they be used together?",
    body: "Yes. Publishing an OpenAPI document for machine consumers and a human-readable reference for developers is a common setup, and the two answer different questions. Nothing about Docloom requires you to drop your existing spec tooling.",
  },
];

export default function NextSwaggerDocComparisonPage() {
  return (
    <ComparisonPage
      eyebrow="Comparison"
      title="Docloom vs next-swagger-doc"
      otherLabel="next-swagger-doc"
      intro="Both tools read your Next.js route handlers and produce API documentation. They differ in what they ask of your code and what they emit: next-swagger-doc turns JSDoc annotations into an OpenAPI document; Docloom reads the handlers and their Zod schemas and emits a hosted markdown reference."
      rows={ROWS}
      sections={SECTIONS}
      playgroundRepo="steven-tey/dub"
      ctaId="vs_next_swagger_doc_playground"
    />
  );
}
