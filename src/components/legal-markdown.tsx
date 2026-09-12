import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Styled markdown renderer for the legal documents in /legal (served at
 * /privacy, /terms, /eula, /cookies, /refunds). Typography follows the site
 * theme; table/code styles mirror the docs hosting page's mdComponents so
 * every markdown surface in the product looks the same.
 */
const mdComponents = {
  h1: (p: React.ComponentProps<"h1">) => (
    <h1 className="text-3xl font-semibold tracking-tight text-zinc-100" {...p} />
  ),
  h2: (p: React.ComponentProps<"h2">) => (
    <h2 className="mt-10 text-xl font-semibold tracking-tight text-zinc-100" {...p} />
  ),
  h3: (p: React.ComponentProps<"h3">) => (
    <h3 className="mt-8 text-base font-semibold text-zinc-100" {...p} />
  ),
  p: (p: React.ComponentProps<"p">) => (
    <p className="my-4 leading-relaxed text-zinc-400" {...p} />
  ),
  ul: (p: React.ComponentProps<"ul">) => (
    <ul className="my-4 list-disc space-y-1.5 pl-5 text-zinc-400" {...p} />
  ),
  ol: (p: React.ComponentProps<"ol">) => (
    <ol className="my-4 list-decimal space-y-1.5 pl-5 text-zinc-400" {...p} />
  ),
  li: (p: React.ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  strong: (p: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-zinc-200" {...p} />
  ),
  em: (p: React.ComponentProps<"em">) => <em className="text-zinc-500" {...p} />,
  a: (p: React.ComponentProps<"a">) => (
    <a
      className="text-zinc-200 underline underline-offset-2 transition-colors hover:text-zinc-100"
      {...p}
    />
  ),
  hr: (p: React.ComponentProps<"hr">) => <hr className="my-10 border-zinc-800" {...p} />,
  blockquote: (p: React.ComponentProps<"blockquote">) => (
    <blockquote className="my-4 border-l-2 border-zinc-700 pl-4 italic text-zinc-500" {...p} />
  ),
  table: (p: React.ComponentProps<"table">) => (
    <div className="my-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p: React.ComponentProps<"th">) => (
    <th
      className="border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-left font-mono text-xs text-zinc-200"
      {...p}
    />
  ),
  td: (p: React.ComponentProps<"td">) => (
    <td className="border border-zinc-800 px-3 py-1.5 align-top text-zinc-300" {...p} />
  ),
  code: (p: React.ComponentProps<"code">) => (
    <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[12px] text-zinc-300" {...p} />
  ),
  pre: (p: React.ComponentProps<"pre">) => <pre className="my-3 overflow-x-auto" {...p} />,
};

export function LegalMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {children}
    </ReactMarkdown>
  );
}
