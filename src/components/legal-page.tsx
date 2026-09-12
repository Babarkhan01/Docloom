import { notFound } from "next/navigation";
import { getLegalDoc, type LegalDoc } from "@/lib/legal";
import { LegalMarkdown } from "@/components/legal-markdown";

/**
 * Shared shell for the five legal policy pages. Reads the markdown from
 * /legal at prerender time and renders it with the site's markdown styling.
 * While a document still contains template placeholders, a visible draft
 * notice is shown above the content — the placeholders themselves are left
 * untouched in the rendered text.
 */
function PlaceholderNotice() {
  return (
    <div className="mb-10 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-400">
      <strong className="font-semibold">Draft notice:</strong> this document
      still contains unfilled placeholders (dates, jurisdiction, contact
      email). It is not final — do not rely on it until this notice is removed.
    </div>
  );
}

export function LegalPage({ slug }: { slug: LegalDoc["slug"] }) {
  let doc: ReturnType<typeof getLegalDoc>;
  try {
    doc = getLegalDoc(slug);
  } catch {
    notFound();
  }

  return (
    <article className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <p className="font-mono text-sm text-accent">/{doc.slug}</p>
      {doc.hasUnresolvedPlaceholders ? <PlaceholderNotice /> : null}
      <div className="mt-6">
        <LegalMarkdown>{doc.markdown}</LegalMarkdown>
      </div>
    </article>
  );
}
