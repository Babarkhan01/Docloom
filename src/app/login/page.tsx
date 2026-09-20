import Link from "next/link";
import { GitHubIcon } from "@/components/github-icon";
import { Logo } from "@/components/logo";

const ERROR_MESSAGES: Record<string, string> = {
  github: "GitHub didn't complete the sign-in. Please try again.",
  invalid_request: "The sign-in request was missing required parameters. Please try again.",
  state_mismatch: "This sign-in attempt expired or was tampered with. Please try again.",
  server: "Something went wrong on our side. Please try again.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] ?? ERROR_MESSAGES.server : null;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8">
          <Logo wordmarkClassName="font-mono text-lg font-semibold tracking-tight" />
          <h1 className="mt-6 text-xl font-semibold tracking-tight">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Docloom uses your GitHub account for sign-in and for read-only
            access to the repositories you choose to connect.
          </p>

          {message ? (
            <div
              role="alert"
              className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400"
            >
              {message}
            </div>
          ) : null}

          <a
            href="/api/auth/github"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-white"
          >
            <GitHubIcon />
            Continue with GitHub
          </a>

          <p className="mt-4 font-mono text-[11px] leading-relaxed text-zinc-600">
            Read-only access only — Docloom can never modify your code. We do
            not store your source code.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-600">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline-offset-2 hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}