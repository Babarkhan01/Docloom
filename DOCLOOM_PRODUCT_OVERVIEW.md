# Docloom — Product Overview

> Docloom generates API documentation from your source code. Structure comes
> from a real TypeScript AST parser. Descriptions come from AI. Anything the
> parser cannot prove is marked "not documented in source" — never invented.

---

## What Docloom is

Docloom is an API documentation generator for Next.js App Router projects that
use Zod for request validation.

You connect a GitHub repository (public or private), and Docloom produces a
structured, hosted API reference document: endpoints, methods, paths, request
bodies with their fields and constraints, response shapes, query parameters,
headers, dynamic route segments, and handler-level detail — all verified
against your actual source before any prose is written.

The output is markdown, hosted at a clean docs site on your own subdomain, and
regenerated whenever your code changes.

### What it does, concretely

Given a repo with Next.js App Router `route.ts` / `route.tsx` files, Docloom
produces a document that includes, per endpoint:

- The HTTP method and path, including dynamic segments like `[id]`.
- The route file the handler lives in.
- Handler parameters and where they come from (URL params vs. handler context),
  with types where provable.
- Validated request bodies: Zod schema name, each field's type, optionality,
  defaults, and constraints exactly as written (`email`, `max(50)`,
  `refine(...)`, etc.). Enums list their literal values.
- Response shapes: JSON payloads with field names and types, the HTTP status as
  written in source, and whether the shape came from an object literal, a
  Zod `.parse()` call, or a declared return-type annotation.
- Query parameters and headers read in source, with names as written and types
  where a matching Zod schema exists in the repo.
- Whether the handler reads the request and returns a `Response`.
- JSDoc / AI-written descriptions per endpoint.
- An honest coverage note at the top: files skipped, files too large, handlers
  that could not be resolved, and the detected framework when it is not App Router.

### What it deliberately does not do

- It does not store your source code. The repo is fetched, processed in memory,
  and the raw code is discarded after generation. There is no code table in the
  database.
- It does not guess. Unresolvable types, dynamic parameter names, imported
  schemas it cannot see, and handlers whose function cannot be resolved are all
  reported as "not documented in source" — never filled in with a plausible lie.
- It does not write back to your repository. GitHub access is read-only.
- It does not claim to support frameworks it does not parse. If a repo uses
  Express, Fastify, or NestJS, the docs say so explicitly instead of returning
  an empty result and pretending nothing is wrong.

---

## What makes Docloom different

The market has two broad categories of API doc tooling, and Docloom sits
between them with a specific position: **AST-verified structure, AI-written
prose, honest gaps.**

### vs. AI-only doc generators

A lot of tools will ask an LLM to read your repo (or a snippet) and write docs
from memory. The problem is well known: LLMs drift, omit edge cases, invent
fields that do not exist, and silently present guesses as facts. When the docs
diverge from the code, the documentation becomes something you have to
constantly re-verify by hand — which is exactly the problem docs are supposed
to solve.

Docloom's structural facts come from a real TypeScript compiler parse of your
source, before any AI is involved. The AI only writes descriptions on top of a
structure that was already extracted deterministically. If the parser cannot
prove something, the doc says so. The result is documentation you can audit
against the code: every field listed is one the parser found; every "not
documented in source" is an honest admission, not a missing piece of an
otherwise-completed picture.

### vs. static analysis / OpenAPI generators

OpenAPI-first tooling (and tRPC-style auto-generation) can produce very precise
docs, but only for code written to produce an OpenAPI spec or to fit a specific
conventions framework. They are excellent when your codebase already speaks
OpenAPI; they are a poor fit when it does not, and retrofitting is a real cost.

Docloom does not require your code to produce a spec. It reads ordinary Next.js
App Router route handlers and Zod usage as written — including wrapped handlers
(`export const GET = withAuth(async ({ params }) => ...)`), cross-file schema
imports (one hop), `Response.json()` with object literals and Zod parse calls,
declared return types, `searchParams.get(...)`, and `req.headers.get(...)`. It
works on code that was not written for any documentation tool.

The tradeoff is honest: Docloom's scope today is deliberately narrow. It
indexes Next.js App Router route handlers with Zod. Anything outside that —
other frameworks, route handlers that do not use Zod, heavily dynamic code — is
handled by saying so clearly rather than by silently producing incomplete docs.

### The honest-gap principle

This is the differentiator in one line: **when Docloom does not know
something, the docs say "not documented in source," and they say it at the
field level, not by omitting the whole endpoint.**

Most inaccurate docs fail in one of two ways: they invent facts, or they hide
the gaps by producing a document that looks complete and is not. Docloom
chooses neither. An endpoint whose request-body fields could not all be
resolved still appears in the document, with the resolvable fields typed and the
unresolvable ones marked. A handler whose wrapper function lives in another file
and cannot be followed still appears, with the wrapper named. The coverage note
at the top tells you exactly what was skipped and why.

That honesty is the selling point for teams that have been burned by
documentation that looked right and was not.

---

## Scope today

- **Framework:** Next.js App Router route handlers (`route.ts` / `route.tsx`).
- **Validation:** Zod request schemas, same-file and one import hop into the
repo. Package imports and unresolvable schemas are named gaps.
- **Language:** TypeScript (and JavaScript route files where they parse).
- **Access:** GitHub repositories, public and private, via a read-only GitHub
App installation.
- **Output:** structured markdown → hosted docs site on your own subdomain.

Anything not in that list is out of scope today and handled honestly when
encountered.

---

## How it works (the pipeline)

1. **Connect a repo.** Sign in with GitHub (GitHub App OAuth, read-only
Contents + Metadata). Pick a repository the app is installed on.

2. **Fetch the repo.** Docloom reads the repo through GitHub's API: the repo
metadata, the git tree (file list), and the individual route files and schema
files it needs. Nothing is persisted — the raw source lives only for the
duration of the processing session.

3. **Parse with the TypeScript compiler.** Each `route.ts(x)` file is parsed
with the TypeScript API. The parser extracts the path (from the file path,
handling route groups), the exported HTTP method handlers, handler parameters
and their origins, wrapped-handler resolution within the same file, Zod request
body schemas (with one-hop cross-file resolution), response shapes from
`Response.json(...)` calls and declared return types, and query/header inputs.

   The parser is strictly read-only and deterministic. It does not call an LLM
   and does not infer types it cannot prove.

4. **AI writes descriptions.** Over the parsed structure, an LLM writes
   natural-language descriptions per endpoint. The AI sees the facts extracted
   in step 3; it does not invent structure. When the parser could not resolve
   something, the AI's prose is gated by that same fact.

5. **Build the markdown.** The facts and the descriptions are combined into a
   structured document with a coverage note, an endpoint summary table, and a
   per-endpoint reference section. The document is honest about what was and was
   not provable.

6. **Host the docs.** The markdown is published to a docs site on your subdomain
   (`{docsSubdomain}.docloom.app`). Regenerate on merge and preview the diff
   before it goes live.

---

## Architecture

### High-level components

- **Next.js 16 App Router application** — the web app and API. One app serves
  the landing page, login, dashboard, admin, and all API routes.
- **GitHub App OAuth** — authorization-code flow, user-to-server tokens. The
  GitHub token is exchanged server-side and stored encrypted; the browser only
  ever holds Docloom's own session cookie.
- **Sessions** — short-lived signed JWT cookie (HS256), with sliding refresh.
  Logout bumps a server-side session version that invalidates previously issued
  tokens. Every API call checks the session against the database; the proxy is
  not trusted alone.
- **Database** — serverless Postgres (Neon) via Drizzle ORM with Neon's
  fetch-based HTTP driver, required for the Cloudflare Workers target (no TCP
  sockets). Schema: users, repos, generations, usage counters.
- **AST parser** — a self-contained TypeScript module using the TypeScript
  compiler API. It is the source of all structural facts. It has no dependency
  on the rest of the app and can be exercised directly (the demo scripts prove
  this offline).
- **Markdown builder** — combines parsed facts with AI descriptions into the
  final document. JSDoc and placeholder fallbacks exist for the no-AI path
  (used by the public playground).
- **Hosting target** — Cloudflare Pages / Workers, via the OpenNext adapter.
  Staging and production from day one.
- **Alerting** — one env var (`DOCLOOM_ALERT_WEBHOOK_URL`, any Slack-compatible
  incoming webhook) and operational failures POST a message there: unhandled
  route errors, failed generation runs, Dodo webhook failures, failed account
  deletions. Fire-and-forget, silent when unset.
- **Health check** — `GET /api/health`, bounded DB check, returns `200
  {status: "ok"}` or `503 {status: "degraded"}`. Point any uptime monitor at it.
- **Public playground** — no-signup, in-memory docs generation for public repos.
  It uses the same parser and markdown builder as the product path, but never
  touches the database or the AI. It is deliberately ephemeral: no docs are saved
  and no account is required. Its job is to let a prospect see real output from
  a real repo in about a minute, then choose to sign in to save and publish.

### Data flow for a generation

```
GitHub repo
  → public/private API fetch (metadata, tree, route files, schema files)
  → TypeScript AST parse (facts only)
  → (AI descriptions, keyed by parsed route)
  → markdown builder
  → stored markdown in generations table
  → hosted docs page
```

The playground short-circuits this at step 6: it stops after the markdown is
built and shows it to the user, with no persistence.

### Security model

- **Read-only GitHub access.** The GitHub App is granted Contents: Read-only and
  Metadata: Read-only. Nothing is ever written back to the repo.
- **Token storage.** The user's GitHub token is exchanged server-side and stored
  encrypted at rest (AES-256-GCM). The browser never sees it.
- **Session integrity.** The session cookie is signed; the server re-validates on
  every API call against the database, and logout invalidates all previously
  issued tokens via a server-side session version.
- **Per-user repo access.** Every repo endpoint checks that the repo belongs to
  the session's user. There is no cross-user access.
- **No source storage.** There is no code table. Source is fetched and processed
  in memory and discarded.
- **Rate limiting.** Public endpoints (OAuth login and callback) and repo
  endpoints are rate-limited, keyed per user. The public playground has its own
  layered limits: per-IP burst, per-IP daily, and a global hourly run cap with a
  concurrency guard.
- **Secrets in environment variables only.** Nothing is hardcoded. `.env*` files
  are gitignored; only the example templates are committed.
- **Security headers.** CSP, HSTS in production, `X-Frame-Options`, nosniff,
  referrer policy. `robots.txt` blocks `/dashboard`, `/admin`, `/login`, and
  `/api`.
- **Admin access is an env allowlist.** The admin dashboard is deny-by-default.
  Unset means nobody is an admin; a typo looks exactly like "no admin" (a 404),
  which is intentional — the route does not advertise itself.

---

## The public playground

The playground is the demo-first entry point. It is a no-signup page where
anyone can paste a public GitHub repo URL and get real AST-verified docs back in
about a minute, with no account and no persistence.

Its constraints are deliberate:

- Public repos only. Private repos are refused with a clear pitch to sign in.
- No database writes. No AI calls in the no-token path (descriptions come from
  JSDoc fallbacks). Nothing is persisted.
- Bounded spend. Per-IP daily limit, per-IP burst limit, a global hourly run
  cap, a concurrency guard, and per-run file and size caps sized to stay inside
  the Workers subrequest budget.
- With a GitHub PAT, the playground's hourly run cap rises and real traffic
  becomes viable. Without one, it is bounded by GitHub's anonymous 60 req/h
  limit — about one run per hour. The PAT is effectively required for real
  traffic.

Deep links work: `/playground?repo=owner/name` pre-fills the form. The form does
not auto-generate on load — the user still clicks generate.

---

## Pricing

Docloom has two surfaces at launch: the product itself (sign in, connect a repo,
generate and host docs) and the Dodo checkout that sits in front of the paid
plans.

### Free tier

A free plan is available for getting started: sign in, connect a repo, generate
docs. It exists so a prospect can see real output from their own private repo
before paying. The limits and what is included are set in the billing layer
(`effectivePlan()`), and a paid plan whose Dodo subscription has lapsed counts
as free until it is renewed.

### Paid plans

Paid plans are sold through Dodo, the in-app checkout. The plans are characterized
by what they unlock beyond the free tier — for example, more repos, more frequent
regeneration, higher caps, team seats, and the hosted docs site under your own
subdomain. The exact plan names, prices, and limits live in the billing
configuration, not in this document, so they can change without rewriting the
product story.

The principle: free gets you to real output; paid is what you buy when you want
the docs to stay current on your own repo, hosted, on a schedule, for your team.

### What is not a separate product

The public playground is not a gated product and has no pricing. It is a
demo surface: paste a public repo, get docs, decide whether to sign in. It is
intentionally no-signup so a link in an email or post sends a prospect straight
to real output.

---

## Reliability and operational posture

### Failure modes that matter

- **GitHub API rate limits.** The product path uses a real GitHub App
  installation token (5,000 req/h). The public playground can use an optional
  PAT for the same ceiling; without one it is bounded by the anonymous 60
  req/h. A playground that returns "GitHub is rate-limiting the playground right
  now" is a configuration problem (the PAT is missing or not attached), not a
  normal operating state, and it is the kind of failure that should alert before
  a prospect hits it after clicking an email link.
- **Very large repos.** A repo whose file count exceeds the playground's entry
  cap is rejected with a clear, named message rather than silently producing a
  partial parse. The cap is configurable with a token, but raising it also burns
  the hourly run cap, which is why the two should be raised together.
- **Unresolvable code.** Wrapped handlers whose function cannot be resolved,
  Zod schemas that live in package imports, dynamic parameter names — all render
  as "not documented in source." This is a feature, not a bug, but it is the
  thing a new user is most likely to misread, so the coverage note is front and
  center.

### What is monitored

- **Health check.** `GET /api/health` is the uptime probe target.
- **Alerting webhook.** One env var; operational failures POST there. It is the
  mechanism by which a broken playground, a failed generation run, or a webhook
  verification failure reaches a human.
- **Admin dashboard.** Internal, read-only growth stats: signups, active repos,
  generations per day, plan breakdown, generation failures, tokens used. Deny by
  default.

### Account deletion

Self-serve in the dashboard's Danger zone (type-DELETE-to-confirm): best-effort
Dodo subscription cancel, session invalidation, then the user row delete cascades
repos, generations, and usage counters. Published docs pages go offline with the
user row. Failures in the Dodo cancel step are reported to the user and alerted.

---

## Brand

The mark is a **loom**: three violet warp threads basket-woven through light weft
lines — threads becoming the lines of a document, which is what Docloom does to
code.

- `logo-mark.svg` — the mark alone, transparent background. Use anywhere the
  surface color is unknown.
- `icon.svg` — the mark on a dark rounded square; the app icon and favicon.

In the app, `<Logo />` renders the mark next to the `docloom.` wordmark. The
weft lines use `currentColor`; the warp threads use the accent color, so the
lockup adapts to any theme.

Tokens: background near-black, foreground off-white, accent violet. Both
typefaces are Geist.

---

## Honest limitations (say these early)

- **Today's scope is Next.js App Router + Zod.** If a team's API is built on
  Express, Fastify, NestJS, or anything else, the docs will say so explicitly.
  That is the right behavior for an MVP, but it is also the thing to be clear
  about when talking to prospects whose stack is not Next.js.
- **Descriptions are AI-written first drafts.** The structural facts are
  verified; the prose is not infallible. The product positions the descriptions
  as a strong first draft worth reviewing, not an oracle.
- **The playground is ephemeral.** It is a demo, not a save feature. Prospects
  who want their own repo's docs saved and hosted need to sign in.
- **Cross-file resolution is one hop.** Schemas imported from packages, or
  through more than one hop, are named gaps. That is an intentional tradeoff,
  not an accident.
- **Wrapped handlers are resolved within the same file.** A wrapper whose
  handler lives in another file is named, not followed. Same tradeoff.

---

## What this document omits on purpose

- No API keys, tokens, client secrets, private keys, app IDs, database
  connection strings, session secrets, encryption keys, webhook secrets, or any
  other credential.
- No specific plan prices or exact plan limits — those live in the billing
  configuration and change over time.
- No internal hostnames, deployment commands beyond what is already public, or
  environment variable values.
- No Dodo configuration specifics beyond "paid checkout is through Dodo."

If you need any of the above, they belong in a private runbook, not in a product
overview that may leave your machine.
