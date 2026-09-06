import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-sm text-zinc-500">404 — page not found</p>
      <h1 className="max-w-md text-2xl font-semibold tracking-tight">
        This route doesn&apos;t exist.
      </h1>
      <p className="max-w-sm text-sm text-zinc-400">
        The docs you&apos;re looking for may have moved. Head back to the
        dashboard to keep going.
      </p>
      <Link
        href="/"
        className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
      >
        Back to Docloom
      </Link>
    </main>
  );
}