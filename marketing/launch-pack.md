# Docloom launch pack (prepared Sep 24–26, 2026)

Everything below is draft-ready copy. Placeholders in `[brackets]` need
your hand before posting. Numbers cited are real, from `demo/README.md`.

---

## 1. Product Hunt

**Tagline (≤60 chars):**
> API docs generated from your code, not the AI's imagination

(58 chars. Alternative: "Docs that track your code" — brand line, 25 chars.)

**Description (≤260 chars):**
> Docloom reads your GitHub repo with a TypeScript AST parser, then AI
> writes descriptions on top of the verified structure: endpoints,
> request-body fields with constraints, response shapes with status codes,
> query params. What the parser can't prove is labeled "not documented in
> source" — the structure itself comes from the AST, never from the model.

**Gallery slides (5):**
1. Hero — "Docs that track your code." + the loom mark + one repo connected.
2. "Facts first" — a real excerpt from `demo/dub-api.md`: the `domain`/`workspaceSlug` request body with `min(1)` constraints and the 5 response branches.
3. "Honest gaps" — side-by-side: a guessed docs generator vs. Docloom's "not documented in source" line.
4. "Regenerate on merge" — the auto-regenerate toggle + diff preview screen (Starter feature).
5. Pricing — Free (1 public repo) / Starter $19 / Team $49, launch offer badge.

**First comment (maker, post at 12:01 AM PT):**
> I kept regenerating API docs by hand, and every AI tool I tried happily
> invented endpoints my code never had. So I built Docloom backwards:
> a compiler (TypeScript AST) extracts every fact first — routes, zod
> request-body fields, per-branch response shapes, query params — and only
> then does AI write descriptions on top of that structure. If the parser
> can't prove a field from source, the docs literally say "not documented
> in source." (Supported today: Next.js App Router + zod.)
>
> It's free for 1 public repo, paid plans add private repos, auto-regen on
> merge, and remove branding.
>
> Roast my demo docs (real output, dub + cal.com): [DEMO LINK]

**Hunters to ask:** 5–10 people who hunted dev tools recently. Ask for
upvote + a *trial*, not just an upvote — signups prove traction.

---

## 2. Show HN (post 1–2 days AFTER PH)

**Title:** Show HN: Docloom – API docs where every fact comes from an AST, not the LLM

**First comment:**
> Every AI docs generator I tried hallucinated at least one endpoint. The
> failure mode is structural: an LLM given a repo will write plausible
> docs whether or not the code supports them.
>
> Docloom inverts the pipeline. A TypeScript compiler pass extracts the
> facts — App Router handlers, zod request-body schemas (including
> cross-file imports, one hop), per-branch `Response.json` shapes with
> their status codes, searchParams/header reads — and the LLM only ever
> writes prose *on top of* those facts. Unprovable fields render as
> "not documented in source". Real output on dub and cal.com: [DEMO LINK]
> (the eval harness and parser are in the open repo: scripts/parser-eval.mjs).
>
> Interesting hard parts: `z.object({a}).extend({b})` must stay unresolved
> (walking the base would drop `b` and present a partial list as complete);
> import cycles resolve to named gaps, never guesses; fetch budget for
> cross-file schemas is bounded so a generation run fits a Workers
> subrequest limit.
>
> Scope today: Next.js App Router + zod (the stack where API docs rot the
> fastest). Express/Fastify/NestJS repos are detected and named honestly
> rather than silently producing empty docs.
>
> Free tier: 1 public repo. Happy to answer parsing questions.

**Anticipated Q&A:**
- *"Why not use the TS type checker / ts-morph?"* → The compiler API is
  used for syntax; semantic resolution is deliberately bounded (one import
  hop) so resolution stays cheap, offline-runnable, and its claims stay
  provable from source. Full typechecker inference is on the roadmap as a
  second pass.
- *"Only Next.js?"* → Yes, App Router `route.ts` today. Express/Fastify/
  NestJS repos are detected and named honestly in the docs instead of
  silently returning nothing.
- *"What if my schemas are generated?"* → They stay named-but-unresolved.
  The docs show the schema name, so a reader knows where to look.

---

## 3. X/Twitter thread (6 posts, Sep 27–28)

1. Every AI docs tool I tested invented endpoints my code doesn't have.
   Plausible ≠ correct. So I built @docloom backwards: compiler first, LLM second. 🧵
2. The parser extracts: endpoints · zod request-body fields with
   constraints · per-branch response shapes with status codes · query &
   header params. From your actual source. [screenshot: dub body fields]
3. The part I'm proudest of: when it can't prove something from source,
   the docs say "not documented in source." The structure comes from your
   AST — never from the model. [screenshot: honest gap line]
4. Ran it on two real repos: 57 endpoints documented from dub, 42 from
   cal.com — 86 response shapes on cal.com alone. Demo: [DEMO LINK]
5. Free for 1 public repo, forever. Paid = private repos + auto-regen on
   merge + no badge. LAUNCH50 = 50% off Starter for 3 months (till Oct 7).
6. Launching on Product Hunt [DATE]. If API docs are your week's chore,
   come try it: [LINK]

---

## 4. dev.to article (Sep 27–28)

**Title:** "We made our docs generator refuse to guess"

Structure:
1. The failure mode: LLM docs hallucinate because plausibility is their objective.
2. The inversion: facts from the TypeScript compiler API; LLM writes prose only.
3. Deep-dive on one honesty rule: why `z.object({a}).extend({b})` must
   stay unresolved (with the code snippet from route-parser.ts).
4. Cross-file resolution in ≤25 bounded fetches; cycles as named gaps.
5. Results table from demo/README.md + link to demo docs.
6. CTA: free tier, LAUNCH50, PH link on launch day.

---

## 5. Outreach — 20 targets (DM/email, Sep 27–28)

**Template (personalize the first line):**
> Hey [name] — I was looking at [repo/product]'s API and noticed the docs
> are [missing / stale since vN / a single README]. I built a tool that
> generates API docs straight from the Next.js source (bodies, responses,
> query params — all AST-verified, no AI invention) and I ran it on a repo
> structured like yours: [DEMO LINK]. Want me to send the docs for
> [repo]? Free for public repos.

**Where to find targets (build the list in ~2h):**
- GitHub search: `filename:route.ts language:TypeScript` stars:>500, sort
  by recently-pushed, no `docs/` or `openapi` in repo → SaaS APIs with code but no docs.
- Products you already use with thin API docs.
- Teams shipping fast (recent releases) — their docs are stalest.

**Scoring for the list:** 20 targets = 10 with public repos (instant demo
material — generate their docs before DMing), 10 private-repo teams (the
paywall pitch: "your API is private; docs are generated in memory, never
stored; private repos are exactly what Starter is for").

**Launch-week sequence per target:** DM Sep 27–28 → follow-up with *their*
generated docs on launch day → convert to Starter (private repo) or free
(published docs = marketing loop).

---

## 6. Day-by-day checklist

**Thu Sep 24 (today) ✅** — code frozen: M1–M4 + landing page committed;
demo docs + eval numbers generated; this pack written.
**Fri Sep 25** — deploy to production; run eval against the live demo
repos again to confirm same numbers; Dodo checkout E2E with a real card;
docs subdomain uptime check; create PH upcoming page with gallery assets.
**Sat Sep 26** — finalize PH gallery slides from demo excerpts; build the
20-target list; schedule X thread; ask 5–10 hunters.
**Sun Sep 27** — post X thread + dev.to article; start DMs; PH page live
with "launching [Tue/Wed]".
**Mon Sep 28** — DM follow-ups; prep HN draft; rest.
**Tue Sep 29 or Wed Sep 30 (pick one)** — LAUNCH. PH 12:01 AM PT, replies
all day, dashboard watch (signups, drafts, published, conversions).
**Thu Oct 1** — Show HN. Answer every parsing question.
**Oct 2–7 (Wed Oct 7)** — outreach follow-ups with per-repo generated
docs; LAUNCH50 expires Wed Oct 7; weekly admin-dashboard review.

**Success metrics (from /admin):** signups/day · drafts generated · docs
published · paid conversions · token spend. Leading indicator: published
docs per signup (target ≥20%).
