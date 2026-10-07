# Directory & launch-platform listing playbook — Docloom

Companion to `launch-pack.md` §1–§6 and `target-list.md`. Section 5 of the
launch pack handles direct outreach; this file handles **listings** — places
that show Docloom to strangers who are already evaluating or discovering dev
tools.

Two goals only: (1) drive signups to the playground or signup page, and (2)
earn useful backlinks/SEO for the product name and "API docs" searches. Every
listing decision below is graded against those two and against the product's
honest scope (Next.js App Router + zod; private repos = Starter). We do not
list where Docloom would be positioned as a general-purpose "AI docs tool"
— that angle is the one the product is explicitly built to contradict.

---

## 0. Read this once, before submitting anywhere

- **Keep one truth across every listing:** Docloom reads repos with the
  TypeScript compiler and writes docs from that structure, with AI only for
  the description prose. Not an AI magic doc writer. Not an OpenAPI editor.
  Not "docs from vibes." Listings that bury the AST point waste the one thing
  that distinguishes the product.
- **One URL everywhere:** use the real deployed domain, not the staging
  `workers.dev` preview (the staging domain is already baked into the privacy/
  terms and demo URLs on the deployed site — replace those placeholders when
  you set DNS). See §6 below for what needs tidying.
- **Screenshots posted on directories should be from real generated output,**
  not staged mockups. The whole pitch is "look at real docs from real repos."
  Dub and cal.com demo markdown is in `demo/`.
- **Reviews/trust-site listings (G2, Capterra, Trustpilot, etc.) are a
  later-stage play, not day-1.** They need real users to review and take
  profile upkeep; list them after launch day, when there's a dashboard to
  measure "published docs per signup."
- **Avoid listing sites that require you to "agree not to list competitors"
  or post fake reviews.** We do not trade trust for a backlink.

---

## 1. Tier 1 — launch-week, high-impact (must-do before Tuesday)

These are the "could drive thousands of visitors in a single day" slot from
the 100-platform roundup. Motivated founders and dev-tool hunters, not
anonymous directory browsers.

| Platform | Angle | Timing | What you submit |
| --- | --- | --- | --- |
| **Product Hunt** | Dev tool / devdocs launch day | PH launch day (launch-pack §6) | PH-upcoming page already drafted in launch-pack §1; finalize gallery from `demo/` excerpts; maker comment pre-written |
| **Show HN** | Show HN: Docloom – API docs where every fact comes from an AST, not the LLM | 1–2 days after PH | Launch-pack §2 has the title + first comment + anticipated HN Q&A pre-written; post as "Show HN," not "Ask HN" |
| **Reddit r/SideProject** | Story angle — "docs generator that refuses to guess" | Same week as X thread | Launch-pack §4-dev.to and `reddit-posts.md` overlap here; post the r/SideProject story post with a working playground link, not a signup link |
| **Reddit r/SaaS** | Discussion angle — "would you trust docs that say I don't know?" | 2–3 days after r/SideProject | `reddit-posts.md` post 2 + OP steelman reply pre-written |
| **Indie Hackers** | Build-in-public + the AST-first story | Launch week, after PH | A short "how we built docs that refuse to guess" post linking to a real demo; revenue/UVP can be light early; IH favors the builder story over the sales pitch |
| **BetaList** | Beta/launch listing | As soon as PH is live | Short description + tag "developer tools" + "API documentation"; free tier if available; use the playground URL as the "visit" link for traction signal |

**DevHunt note:** If you pursue DevHunt as a dev-tool analog of PH, run the
same angle as PH but smaller — don't double-submit the same launch-day energy.

---

## 2. Tier 2 — high-quality directories (steady organic, SEO + discovery)

These build long-tail discovery and backlinks rather than a one-day spike.
Submit these in the week after launch, a few per day — not all at launch.

**Best fit for Docloom:**

| Directory / type | Why it fits | Angle / description |
| --- | --- | --- |
| **AlternativeTo** | People search "alternative to [x]", and "Swagger / OpenAPI docs," "Postman docs," "Redoc," etc. are real search-intent targets | "Docs generator that reads your Next.js code and refuses to guess — AST-verified endpoints, request fields, responses from source." Do not claim to "replace Swagger" — position as a docs-for-devs supplement for code-first teams |
| **SaaSHub** | Clean SaaS directory; "[product] alternatives" queries | List the category as "Developer Tools" / "API Documentation"; tag Next.js, zod, TypeScript |
| **StackShare** | Developers discover tools in their stack; strong fit if Docloom lands in engineering teams' workflows | List as something that sits alongside GitHub/Next.js; not an infra tool, a workflow tool for API docs |
| **GitHub Topics / repo listing** | If Docloom's own repo (parser, eval harness) is public, topics + a README badge are free and rank for the stack keywords | Topics: `api-docs`, `documentation-generator`, `nextjs`, `typescript`, `zod`; README badge pointing to playground |

**Fair-warning / skip-after-launch types (still listed by the 100-platform
roundup but low fit for Docloom at launch):**

- **G2 / Capterra / Software Advice / GetApp:** enterprise review sites —
  valuable later but need real reviewed users and ongoing maintenance. Queue
  them after there are real signups.
- **Trustpilot / TrustRadius:** same reason; wait for real users + positive
  review base.
- **Crunchbase:** useful for legitimacy once funded or with a real org profile;
  early solo founder company can list but doesn't get the same lift.

---

## 3. "Add your tool" pages on developer-tool and API-doc adjacent sites

Rather than generic SaaS directories, target sites where developers looking
for API-doc tooling already hang out and where a small, genuinely differentiated
product can be a natural addition:

**Angle for each submission:** short, honest pitch + the one differentiator
(the AST-first, no-guess rule) + a working playground link. Keep it to the
platform's allowed length — boilerplate "built with AI" pitches get ignored
or removed.

| Where to look / submit | Fit | What to pitch |
| --- | --- | --- |
| **Dev-focused "awesome" / curated lists** | High if the list is curated and active (e.g., awesome-nextjs-adjacent, API docs lists, developer-tools roundups) | "AST-verified API docs from Next.js + zod, with explicit gaps rather than hallucinated endpoints." |
| **Dev.to / blog post as a listing** | Listing *in form of* the dev.to article from launch-pack §4 doubles as a listing (SEO + discovery from the article itself) | Post "We made our docs generator refuse to guess" + link to playground. |
| **GitHub Discussions / community threads** | Where teams ask "how do you handle API docs?" or "what tool generates docs from source?" | Answer with the AST-first framing, not a promo. Lead with the demo, then the link. |
| **Integration / marketplace directories** | Relevant only if Docloom integrates with something other devs discover (e.g., listed next to GitHub App install flows, docs-publishing workflows) | List on whichever marketplace fits a "docs generator" or "GitHub App" category that exists. |
| **Comparison / "X vs Y" discussion places** (where allowed) | Only if genuinely useful, not astroturf | If Docloom competes with or complements a named tool, answer the comparison honestly, and link to a real comparison in blog form rather than one-upping in a comment. |

**What not to submit to:** generic "submit your startup" directories that do
not let a dev-tools angle surface (product photos, non-technical descriptions,
no category for "API docs" or "developer tools"). General business small-biz
directories are low-signal here.

---

## 4. Launch-week copy — reusable blocks

Cut-and-paste these into any listing's description field, trimming length.

**One-liner (platform title / short-blurb slot, ≤60 chars recommended):**
> API docs generated from your code, not the AI's imagination

**Short description (≤260 chars):**
> Docloom reads your GitHub repo with a TypeScript AST parser, then AI writes
> descriptions on top of the verified structure: endpoints, request-body
> fields with constraints, response shapes with status codes, query params.
> What the parser can't prove is labeled "not documented in source" — the
> structure itself comes from the AST, never from the model. Free for 1 public
> repo. Supports Next.js App Router + zod.

**Longer description (directory that allows more):**
> Docloom generates API documentation by reading your actual source code with a
> TypeScript compiler pass, not by guessing from a repo prompt. The parser
> extracts App Router route handlers, zod request-body schemas (including one-hop
> cross-file imports), per-branch `Response.json` response shapes with their
> status codes, and query/searchParams/header inputs — then the LLM writes short
> descriptions on top of that verified structure. If the parser can't prove
> something from source, the docs visibly say "not documented in source" instead
> of inventing a field. Real output on dub and cal.com is available in the
> playground. Scope today: Next.js App Router + zod (Express/Fastify/NestJS repos
> are detected and named honestly rather than silently returning empty docs).
> Free tier: 1 public repo. Paid plans add private repos, auto-regenerate on
> merge, and remove branding.

**Demo / proof line (any platform that asks "how can people see it?"):**
> Paste a public repo in the playground and get AST-verified docs in about a
> minute, no signup required: [PLAYGROUND LINK]

---

## 5. Landing-page / site-level listing hygiene

Some "listings" are really your own site showing up in search, directories,
and social cards. A couple of quick wins:

1. **Title tag + meta description already point at the value prop.**
   `robots.ts` allows the playground page (indexable) — that's the demo-first
   hook: strangers who find the playground can convert without a signup wall,
   and those who do sign up are already convinced.
2. **Home page should front-load the "facts first" statement and the free-tier
   CTA.** Already in `src/app/page.tsx`.
3. **Demo links on the home/marketing pages should point at real generated
   markdown or the playground with a pre-filled `?repo=` deep link.** The
   deep-link affordance is already wired (playground pre-fills on
   `?repo=owner/name`). Make sure the demo links on the landing page use real
   links, not `[DEMO LINK]` placeholders.
4. **Open Graph + Twitter card images:** use the PH gallery slides or a stripped
   down version — a hero slide, the "honest gaps" slide, and the pricing slide
   give consistent visuals across PH, LinkedIn, X, Reddit, and directory cards.
5. **Pricing page clarity:** Free / Starter / Team with the launch offer badge
   and LAUNCH50 expiry (Oct 7) — already drafted in launch-pack §1. Ensure the
   pricing page lists what's in each tier without hiding private-repo / auto-
   regen / branding as buried surprises.

---

## 6. Placeholders to replace before any submission goes live

Before listing anywhere, replace these with real values so nothing links to a
placeholder or staging preview:

- `{PLAYGROUND_URL}` / `[DEMO LINK]` / `{DEMO_URL}` / `{STARTER_URL}` /
  `{PRIVACY_URL}` in `marketing/prospect-emails.md`
- `{PLAYGROUND_URL}` in `marketing/target-list.md`
- `[DEMO LINK]` in `marketing/launch-pack.md` (runs in a few places)
- The deployed domain baked into `marketing/reddit-posts.md` and the legal
  content (privacy/terms reference a workers.dev preview URL today — swap to
  the real production URL when DNS for the real domain is live).

If the real domain is not live yet, list with whatever public URL is stable
*now* and plan the update once it is — but do not let a directory link to a
staging preview that will change or disappear.

---

## 7. Suggested submission order and pace

**Launch week (before Tuesday or right after PH, depending on which milestone
you treat as launch day):** Product Hunt → Show HN → r/SideProject → r/SaaS →
Indie Hackers → BetaList. Do these in order; each is a real effort moment, not
a "submit and forget."

**Week 2 (steady):** AlternativeTo, SaaSHub, StackShare, GitHub topics/badge.
A handful per day — each takes 5–15 min; spacing avoids being read as a
directory bot.

**Week 3+ (review/trust sites):** queue G2, Capterra, Trustpilot, TrustRadius
only after you have real users who would plausibly leave an honest review.

---

## 8. Success signals per listing type

- **Viral launchers (PH, Show HN, r/SideProject, r/SaaS):** visitors per day,
  signups per day, posts/replies per post, any parser-question traffic (a
  sign people actually care about the technique).
- **Directory SEO / backlink listings (AlternativeTo, SaaSHub, StackShare):**
  referral signups from those domains, search impression share for the product
  name + "API docs," and the link itself (quality, dofollow vs nofollow
  aside).
- **Blog/listing hybrids (dev.to, Indie Hackers, comparison posts):** views,
  link clicks to playground, any inbound from people who want a demo on their
  own repo.

Track by source where possible (UTM on directory links for the marketing-led
listings; referral path otherwise) so you can drop the low-signal ones and
double down on the ones that bring signups.

---

## 9. Anti-spam / quality rules for listing activity

- One submission per platform. Do not submit the same product under slightly
  different names.
- Never post "fake" upvote/review farming on trust sites. We don't trade
  trust for listings.
- Don't spam the same pitch into every GitHub discussion, forum, or chat that
  mentions API docs. Answer one question well or not at all.
- Keep listing descriptions honest about scope. "Only Next.js App Router + zod
  today" is the honest line; listing it as a general reverse-engineer-any-repo
  tool would create broken expectations and refunds/complaints.
