<img src="public/logo-mark.svg" alt="" width="44" height="37" />

# Docloom

Docs that track your code. Connect a GitHub repo (public or private) and Docloom
generates accurate, structured markdown docs for your API — AST-verified
structure, AI-written descriptions, auto-hosted at a clean docs site.

**Current status — MVP stage 1 (built):** project scaffold, GitHub App OAuth
login, session management, and the repo-connection screen (connect a repo →
it appears on your dashboard). Parsing/generation is deliberately **not**
started yet, per the build order in the PRD: *get one repo connecting and
listing successfully before touching parsing/generation logic.*

---

## Stack

- **Frontend + API:** Next.js 16 (App Router, Node runtime) + Tailwind CSS v4 — one app serves both
- **Database:** Neon (serverless Postgres) via Drizzle ORM + Neon's fetch-based HTTP driver (`@neondatabase/serverless`) on the pooled connection string — required for Cloudflare Workers (no TCP sockets)
- **Auth:** GitHub App OAuth 2.0 (authorization code flow, user-to-server tokens)
- **Hosting (target):** Cloudflare Pages/Workers; staging + production from day one
- **Sessions:** signed httpOnly JWT cookie (Jose, HS256)

## Prerequisites

- Node.js 20+ and npm
- A GitHub account (to create the GitHub App)
- A Neon account (or use the setup link in the next section)

## 1. Create the GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.
2. **GitHub App name:** `docloom-dev` (any unique name).
3. **Homepage URL:** `http://localhost:3000` (your `APP_URL`).
4. **Callback URL:** `http://localhost:3000/api/auth/github/callback` — see the
   note below, this must match `APP_URL` exactly.

> **The callback URL must be exact.** GitHub matches the `redirect_uri` we send
> against the callback URLs registered on the App (a literal string comparison;
> wildcard matching is off unless you explicitly enable it per URL in the App
> settings). Docloom builds it from `APP_URL`, so the rule is one line:
> **registered callback URL == `${APP_URL}/api/auth/github/callback`.**
>
> | Where | `APP_URL` | Callback URL to register |
> |---|---|---|
> | Local dev | `http://localhost:3000` | `http://localhost:3000/api/auth/github/callback` |
> | Staging | `https://staging.docloom.app` | `https://staging.docloom.app/api/auth/github/callback` |
> | Production | `https://docloom.app` | `https://docloom.app/api/auth/github/callback` |
>
> You can register up to 10 URLs on one App, so all three fit side by side. Two
> things that bite: a **trailing slash** on `APP_URL` (stripped automatically
> since the OAuth fix, but keep it clean) and a `*.workers.dev` or preview
> hostname — if users reach the app there, that host must be registered too, or
> `APP_URL` must point at the real domain.
5. **Permissions** (this is what makes access *read-only*):
   - Repository → **Contents: Read-only**
   - Repository → **Metadata: Read-only** (required, auto-granted)
6. **Request user authorization (OAuth) during installation:** ✅ enabled —
   this is what issues user-to-server tokens.
7. **Webhook:** disable (Active: unchecked) — no webhooks needed for the MVP.
8. Save, then note down:
   - **App ID** → `GITHUB_APP_ID`
   - **Client ID** → `GITHUB_CLIENT_ID`
   - **Generate a client secret** → `GITHUB_CLIENT_SECRET`
   - **Generate a private key** (downloads a `.pem`) → `GITHUB_PRIVATE_KEY`
     (paste the PEM contents into the env var, or base64-encode it first).

> **Why a GitHub App and not a classic OAuth App?** Classic OAuth's `repo`
> scope needed for private repos is read+write at the platform level. A GitHub
> App grants strictly read-only Contents/Metadata permissions — matching the
> "read-only repo access" principle in the PRD/tech spec.

> **Install the app on your repos:** after signing in, connect a repo from the
> dashboard. Only repos the app is installed on appear in the connect list.

## 2. Create the Neon database

1. [Create a Neon project](https://console.neon.tech) (free tier is fine for
   the MVP).
2. Copy the **connection string** from *Connection Details* (pooled connection
   works; unpooled also fine at this scale) → `DATABASE_URL`.
3. Apply the schema (migration is already generated in `drizzle/`):

```bash
npm install
npm run db:migrate   # reads DATABASE_URL from .env.local
```

## 3. Configure environment

```bash
cp .env.example .env.local
# fill in: GITHUB_APP_ID, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
# GITHUB_PRIVATE_KEY, DATABASE_URL
```

`SESSION_SECRET` and `ENCRYPTION_KEY` already have dev values in `.env.local`;
generate fresh ones for staging/production (`openssl rand -base64 32`).

Staging and production use their own env files (`dotenv-cli`):

```bash
cp .env.staging.example .env.staging      # staging config — separate DB, separate GitHub App
cp .env.production.example .env.production
```

## 4. Run

```bash
npm run dev                # local (uses .env.local)
npm run dev:staging        # staging (uses .env.staging)
npm run build:production && npm run start:production
```

Other scripts:

| Script | Purpose |
|---|---|
| `npm run db:generate` | Generate a new migration from `src/lib/schema.ts` |
| `npm run db:migrate` / `db:migrate:staging` | Apply migrations (dev/staging) |
| `npm run db:studio` | Drizzle Studio for inspecting the DB |
| `npm run lint` | ESLint |
| `npm run build` | Production build + typecheck |

## Project structure

```
src/
  proxy.ts                    # Auth gate + sliding session refresh (Next 16 proxy)
  app/
    page.tsx                  # Landing page (hero, how-it-works, FAQ)
    login/page.tsx            # "Continue with GitHub" (OAuth entry)
    dashboard/page.tsx        # Connected repo list + status
    admin/page.tsx             # Internal growth dashboard (allowlisted admins only)
    api/
      auth/github/route.ts    # Start OAuth (state cookie → GitHub)
      auth/github/callback/route.ts  # Exchange code, upsert user, issue session
      auth/logout/route.ts    # Bump session_version + clear cookie
      repos/route.ts          # GET connected repos, POST connect
      repos/available/route.ts# GitHub repos available to connect
  lib/
    schema.ts                 # Drizzle schema (spec §2: users/repos/generations/usage_counters)
    db.ts                     # Lazy neon-http + drizzle singleton
    github.ts                 # App JWT, OAuth exchange/refresh, repo listing, install tokens
    session.ts / session-core.ts  # Cookie helpers + pure jose token logic
    crypto.ts                 # AES-256-GCM token encryption at rest
    rate-limit.ts             # In-memory limiter for public endpoints
    admin.ts                  # Admin allowlist + aggregate growth stats queries
  components/                 # Dashboard UI (modal, cards, badges)
drizzle/                      # SQL migrations
```

## Architecture & security model

Follows the Technical Architecture & Security Spec. Highlights:

- **Auth:** GitHub OAuth authorization-code flow; the GitHub token is exchanged
  and stored server-side only (encrypted at rest with AES-256-GCM) — the
  browser only ever holds Docloom's own signed session cookie. The OAuth
  `redirect_uri` is derived from `APP_URL` (`oauthRedirectUri()`), never from
  the request Host header — a fixed, registered value that can't be influenced
  by the caller.
- **Sessions:** short-lived (24h) JWT with sliding refresh in `proxy.ts`
  (re-issued past 12h). Logout bumps `users.session_version`, which invalidates
  all previously issued tokens server-side — the DB check runs on every API
  call (`getAuthorizedUser`), never trusting the proxy or the client alone.
- **Repo access is per-user, enforced server-side** on every request
  (`repos.user_id` is always checked against the session).
- **Read-only GitHub access:** Contents + Metadata, read-only; contents are
  only ever fetched through short-lived installation tokens during a processing
  session. **No source code is stored** — the schema has no code table.
- **Rate limiting** on all public endpoints (OAuth login/callback) and on
  repo endpoints, keyed per user.
- **Security headers** (CSP, HSTS in prod, `X-Frame-Options`, nosniff,
  referrer policy) set in `next.config.ts`; `robots.txt` blocks
  `/dashboard`, `/admin`, `/login`, `/api`.
- **Secrets:** everything via environment variables — nothing hardcoded,
  nothing committed (`.env*` is gitignored; only `.env.example` and the
  staging/production templates are committed).

## Admin dashboard (`/admin`)

An internal, read-only growth dashboard: total signups, signups per day, active
repos, doc generations per day, and the effective plan breakdown — plus
all-time generation failures and tokens used.

Access is an **environment allowlist**, because the schema has no roles table
and one page doesn't justify adding one:

```bash
# .env.local (and .env.staging / .env.production) — comma-separated GitHub logins
ADMIN_GITHUB_LOGINS=babarkhan
```

- **Unset means nobody is an admin.** The page is deny-by-default: signed-in
  non-admins (and everyone, when the var is missing) get a plain **404**, so the
  route doesn't advertise itself. A wrong/typo'd login looks exactly like that —
  if you see a 404 while signed in, check the allowlist.
- Gate order: `proxy.ts` bounces anonymous visitors to `/login` (cheap check),
  then the page re-checks authoritatively via `getAuthorizedUser()` + `isAdmin()`.
- Admins get an `admin` link in the dashboard header automatically.
- Day buckets are **UTC** and the charts cover the trailing 30 days; the stat
  cards are all-time. `users.createdAt` is bucketed with Postgres `date_trunc`,
  and the plan tally runs through `effectivePlan()` (`lib/billing.ts`) so it
  matches the plan a user actually gets — a paid plan without a live Dodo
  subscription counts as `free`.
- Everything is aggregated in `lib/admin.ts` with a handful of read-only
  queries. No new tables, no writes, no caching (`force-dynamic`) — refresh for
  fresh numbers. `robots.txt` and page metadata both disallow indexing.

## What's next (in order)

1. **AST parsing** of the connected repo (TypeScript compiler API): routes,
   function signatures, param/return types — deterministic facts, never from
   the LLM.
2. **Generation engine** with AI-written descriptions over the parsed
   structure → structured markdown, recorded in `generations`.
3. **Hosted docs** at `{docsSubdomain}.docloom.app` (separate worker/pages
   project) + **regenerate button with diff preview**.
4. **Quotas & spend limits BEFORE generation ships** (tech spec §4): per-plan
   quotas via `usage_counters`, daily per-user caps, global spend ceiling,
   token cost tracking per generation, circuit breaker.
5. Monitoring (Sentry + UptimeRobot), backups, then launch readiness.

## Brand

The mark is a **loom**: three violet warp threads basket-woven through light
weft lines — threads becoming the lines of a document, which is what Docloom
does to code. Two files carry it:

- `public/logo-mark.svg` — mark alone, transparent background. Use in READMEs,
your own docs, anywhere the surface colour is unknown.
- `public/icon.svg` — app icon: the mark on a `#09090b` rounded square. Served
as the favicon (wired in `src/app/layout.tsx`) and as the PWA icon via
`src/app/manifest.ts`.

In the app, import `<Logo />` from `@/components/logo` — it renders the mark
next to the `docloom.` wordmark. The weft lines use `currentColor` and the warp
threads use `--accent`, so the lockup adapts to any theme. Sizing is done with
classes: `<Logo markClassName="h-4 w-[19px]" />`.

Tokens (from `src/app/globals.css`): background `#09090b`, foreground
`#f4f4f5`, accent `#8b5cf6`, both typefaces Geist.

## License / legal

Terms & Privacy drafts live in the planning docs and must be finalized and
reviewed before launch (see `~/Desktop/~:docloom/05-…` and `06-…`).

