# Where Docloom buyers actually are — and how to reach them

Companion to `target-list.md`, `reddit-posts.md`, `listings.md`,
`mmccaff-strategy.md`. The question here is not "where can I submit a startup."
It's "where are the people who actually need Docloom right now, and how do I
get in front of them with a message that lands?"

Two kinds of "need":

1. **Active problem now** — a founder/team currently maintaining API docs that
   rot, are missing, or are behind a wall, and who would feel the pain this
   week. These people don't list themselves; you find them by searching where
   they complain or ask.
2. **Latent need** — developers evaluating API-doc tooling or dev tools, who
   will convert if the right message surfaces in the right place. These show up
   on discovery channels (search intent, curated lists, dev-tool directories).

Track the split in your outreach: active-need targets get the personalized,
demo-first email; latent-need targets get a discoverable listing + a good pitch.
Don't treat them as the same play.

---

## 0. What "need Docloom" actually looks like

A person with a real Docloom need is almost always in one of these states:

- They run a Next.js + zod API and their docs are stale, missing, a single
  README, or behind a signup wall — and that's a real cost (support load, slow
  onboarding, reviewers not trusting the API, customers not adopting).
- They ship fast (weekly releases) and hand-written docs can't keep up — the
  whole point Docloom exists.
- They're tired of AI docs generators inventing endpoints/fields/responses that
  don't exist — the problem Docloom is built to contradict.
- They're an integration/API developer whose customers' #1 complaint is "I
  can't figure out your API" — the integration-heavy products in the CSV (Nango,
  Scenario, thirdweb-style, Zoko, Portable, Dock) are exactly this.

If someone doesn't have API docs as an active pain, Docloom is a nice-to-have.
Nice-to-have outreach is low-signal and feels like spam. Be honest about that
when you pick targets.

---

## 1. Active-need targets — find them by searching where they complain

These are the people with the problem now. You find them by searching the places
where devs and founders talk about docs pain. A complaint about stale/missing/
rotting API docs is a gift — a real, current, specific lead.

### 1.1 Search queries to run (do these, don't guess)

**GitHub (best active-need source for a code-first product):**
- `filename:route.ts language:TypeScript stars:>500 sort:pushed` — publicly
  exposed Next.js APIs on active repos. Cross-reference with the presence/absence
  of docs: a repo with route.ts files and no `docs/`, no OpenAPI, no README API
  section is exactly the profile Docloom handles.
- `filename:route.ts language:TypeScript stars:>500 pushed:>2026-01-01` to
  bias toward recently active repos — their docs drift fastest.
- For each hit, check whether there's a public `/docs`, an OpenAPI/Swagger artifact,
  a rendered API reference, or nothing. No docs = strongest need. Thin docs = still
  strong. Great docs = weaker fit — skip (or it becomes a "your method vs theirs"
  pitch only if you genuinely have one).

**GitHub Issues / Discussions search (real problems, not profile browsing):**
- In repos you're evaluating, search issues for `"docs"`, `"documentation"`,
  `"missing"`, `"stale"`, `"outdated"`, `"not documented"` — an open issue about
  docs is a direct signal of current, acknowledged pain. People who filed that
  issue care *now*.

**Reddit and forums (complaint + question search):**
- Search Reddit, HN, dev.to, Stack Overflow for phrases like:
  - "API docs are stale"
  - "API documentation is outdated"
  - "generating API docs from code"
  - "generate docs from source code"
  - "OpenAPI vs docs from source"
  - "Next.js API docs"
  - "how do you document your API"
  - "API docs generator"
- When you find a thread that's genuine (a question or a complaint, not a rigged
  promo), that's your in: answer the question honestly and lead with a demo link,
  not a product pitch. A single real, helpful answer in the right thread beats a
  pile of "list your startup" submissions.

**Twitter/X searches (conversational, but watch for noise):**
- Searches for "docs are stale", "API docs rot", "docs generator", "OpenAPI" +
  "Next.js", "zod" + "docs", "not documented" — filter for real complaints and
  real questions, not self-promo. Reply where a reply genuinely helps.

**HN and dev.to and blog comments:**
- HN threads on API docs, developer tooling, "document your API," Next.js, docs
  rot.
- dev.to posts or blog posts that mention the docs problem; comment where a comment
  adds real value, then only if appropriate link to a demo.

**The live touch:**
- People who actively tried AI docs generators and got burned by hallucinations
  are an ideal Docloom audience. Search for complaints like "AI docs generator
  invented an endpoint" or "AI docs tool hallucinated" — those people already
  learned the lesson Docloom was built to answer. Target them directly with the
  "docs that refuse to guess" pitch and real output.

---

## 2. Latent-need targets — discovery channels where evaluators look

These are places people go when they're evaluating tooling. Lower urgency than
active-need, but higher volume and lower effort per lead if the pitch is right.

### 2.1 Developer discovery channels (where dev-tool evaluators actually go)

- **GitHub search results above** also feed latent need: the same search surfaces
  repos whose owners may not realize they have a docs problem until you show them a
  diagnostics-free generated doc. For a latent-need hit, the pitch is "here's what
  your repo would look like documented, free, in a minute — no signup required."
- **AlternativeTo** and comparison intent: people search "alternative to Swagger /
  OpenAPI editor / Postman docs / Redoc / Stoplight / ReadMe." Docloom isn't a
  general replacement for all of those (some are design-first, some are testing-first),
  but for code-first devs who want docs *from their Next.js code*, Docloom is a
  real alternative story. Submit once, honest scope, good demo link.
- **SaaSHub / StackShare / native dev-tool directories** — where developers browse
  tools in a category. Docloom belongs in a "Developer Tools" / "API Documentation"
  category, tagged with Next.js, TypeScript, zod. These surfaces work for evaluators,
  not for urgent buyers — pitch accordingly (short, honest, demo link).
- **Dev-focused curated lists and "awesome" lists** — curated lists where someone
  maintaining the list adds a genuinely differentiated tool and the audience actually
  sees it. Better than a raw "submit a startup" form. Worth the curation effort if
  you can find the right list and write a tight entry.

### 2.2 Launch-week attention as discovery (it's both pursuit and discovery)

- **Product Hunt, Show HN, r/SideProject, r/SaaS, Indie Hackers** — these are
  launch-week spikes but also *discovery* events. A developer who didn't know Docloom
  needed a docs problem can discover it there. For these, the demo-first pitch is the
  only thing that works: a post with a real playground link and real generated docs
  converts; a promo post without a demo is noise.
- Blog/listing hybrids (dev.to article "We made our docs generator refuse to guess",
  IH build-in-public post) double as discovery content. They surface in search for
  people typing "API docs generator," "generate docs from source," "Next.js API docs,"
  etc. Treat them as evergreen discovery content after the launch week.

### 2.3 Comparison / "X vs Y" places — only where they're genuinely useful

- Places where someone genuinely asks "how do you document your API" or compares
  tools are opportunities. The right play: answer the question honestly, lead with the
  demo, and only if the thread supports it link to the playground.
- Do not astroturf "X vs Y" threads. If Docloom is genuinely a reasonable thing to
  mention in a real comparison, mention it. Otherwise, you're wasting energy and
  trust.

---

## 3. Where Docloom's pitch actually lands — and where it doesn't

This is the filter that makes the rest of the list real. Docloom's pitch is
specific: "docs generated from your Next.js + zod source by a TypeScript compiler
pass, with AI only for descriptions; anything the parser can't prove is labeled '
not documented in source.'" That pitch is a great fit in some channels and a terrible
fit in others.

**Where the pitch lands:**
- Dev-tool audiences who understand that AI docs generators hallucinate and who would
  value a tool that *refuses* to guess.
- Next.js + zod API owners whose API docs are a real pain.
- Integration/API sellers whose customers complain about not being able to figure out
  the API.
- People who've already tried AI docs generators and got burned by hallucinations.
- Maintainers of public Next.js repos who want docs without hand-writing them.

**Where the pitch does **not** land, or lands as spam:**
- General small-business / founder-culture / "share your startup" crowds that don't
  understand or care about API docs as a problem. The pitch lands as random noise there.
- Places that reward "breakthrough AI" framing and would punish "we chose to be
  incomplete-over-wrong." Docloom's honesty is the differentiator; in places that want
  hype, it reads as a downside. Don't force the pitch there — you'll lose.
- Places whose audience is not developers and not API owners (small-biz owners, random
  startup browsers, founder-culture sub-early-stage crowds). Skip.
- Places where you can't lead with a demo, can't show real output, or can't honestly
  describe what Docloom documents today (Next.js App Router + zod only). If you can't
  be honest in the pitch, the place is wrong or the pitch is wrong; fix the pitch, not
  the place.

---

## 4. How to reach them — the demo-first rule

The single rule that keeps Docloom outreach from being spam is: **the hook is
the demo, not the product.** Every channel below works only if the pitch leads with
real output from real repos, with one link that shows the method.

For a person with active need (a real docs problem right now), the hook is
personalized: "I looked at your API and your docs are X — I generated docs for a
repo structured like yours here, and this is the part I'd highlight for yours."

For a latent-need evaluator, the hook is the method: "docs from your Next.js code,
AST-verified, no guesses — paste a public repo and see it in a minute."

Both hooks converge on the playground or a `?repo=` deep link. That's the
non-negotiable: anywhere Docloom shows up, the shown proof should be a real generated
doc or the playground with a real repo pre-filled. No mockups, no "I built a tool"
without "here's what it produces."

**The rule in practice:**
- Before you post/email/send anywhere, verify the link resolves.
- Before you DM an active-need target, run their repo (if public) and proofread the
  generated doc. If it produces 0 endpoints or an unsupported-framework notice, don't
  send the demo-first email — move to the honesty/privacy/Starter pitch or drop them.
- Before you list Docloom anywhere, make sure the description is honest about scope.
  The honest scope is the differentiator and the honesty constraint at the same time.
- Before you comment in a thread, make sure the comment answers the thread's question.
  If the comment is only a pitch, skip.

---

## 5. A practical weekly plan — channels actually worth your time

From launch week forward, the channels that earn your time:

**Active-need pursuit (high effort, high signal, ongoing):**
1. GitHub search for `filename:route.ts language:TypeScript` on active public repos
   — each hit becomes a potential target; run the repo, check for docs, and decide
   Track A vs Track B vs drop.
2. GitHub Issues/Discussions search for "docs" and "missing docs" in those repos —
   real open issues about docs are direct, current leads.
3. Reddit / HN / dev.to / blog thread searches for docs-pain complaints and questions
   — answer where it genuinely helps, lead with a demo link.

**Latent-need discovery (lower effort per lead, decent volume, ongoing):**
4. AlternativeTo, SaaSHub, StackShare — honest submission, once each, one demo link
   each.
5. GitHub topics / repo listing (if Docloom's own code is public) — topics + a README
   badge pointing to the playground.
6. Dev.to / IH blog posts as evergreen discovery content — these stay findable in search
   for "API docs generator," "generate docs from source," etc.

**Launch-week spikes (do once, with real demo links):**
7. Product Hunt, Show HN, r/SideProject, r/SaaS, Indie Hackers, BetaList — the launch
   pack already has these drafted with real demo links and honest copy.

**Don't spend time on:**
- The 60+ generic "submit a startup" directories that don't surface dev tools
  (Startup Stash, Startup Tabs, Startup Tracker, Startup Base, Startup Beat, Tech Pluto,
  Startup Rankings, etc.). They're the dead-links part of the mmccaff list.
- Subreddits whose audience is not developers / API owners (r/startups, r/Entrepreneur,
  r/Coupons, r/SmallBusiness, r/IndieBiz, r/thesidehustle) as Docloom outreach channels.
- Trust/review sites before there are real signups to review.
- Astroturf comparison threads.

---

## 6. Finding more targets than the 14 in the CSV

The CSV you have is a good start but it's filtered on firmographics, not on API-docs
need. To keep finding real-need targets, build the muscle:

1. **GitHub search as a continuous discovery loop** — run `filename:route.ts
   language:TypeScript stars:>500` periodically, filter by docs presence, and build a
   rolling target list. Every new recently-pushed repo is a fresh candidate.
2. **Products you already use** with thin or stale API docs — you experience the pain
   firsthand, so the personalization is real.
3. **Teams shipping fast** — recent releases = stale docs. Cross-reference with GitHub
   "pushed" sort and release cadence if visible.
4. **API-first products** — their docs are their storefront, so docs pain is acute and
   visible. This is the Nango/Scenario/thirdweb/Zoko/Portable/Dock profile from the CSV.

Keep both lists growing: an active-need list (people with the problem now, found by
searching complaints/questions) and a latent-need list (evaluators on discovery channels
and public repos whose owners just haven't seen the problem yet).

---

## 7. How to verify intent before you send

Before you outreach to any target, verify that the need is real enough that the pitch
won't feel like spam:

1. **Is there an API?** The target should expose an API to customers or developers. If
   their product has no API customers read, Docloom isn't their problem.
2. **Are their docs real pain?** Check for stale README-only docs, a missing API
   reference, docs behind a wall, a stale OpenAPI artifact, or a docs page that hasn't
   moved since a real release. A target whose docs are current and good is not a Docloom
   lead — it's a "your method vs theirs" comparison target at best.
3. **Is it a Next.js + zod candidate, or at least a TypeScript API shop?** Track A
   requires a public Next.js App Router + zod repo you can run; Track B works for any
   TypeScript API shop with a private API and a docs problem. If it's not TypeScript and
   not a zod/Next.js API, Docloom's honest scope makes it a weak fit — be honest about
   that, either in the pitch or by dropping the target.
4. **Is the person reachable and likely to decide?** At the company sizes in your CSV,
   founder/CTO-level decision is real. Don't scatter to mid-level contacts in large
   enterprises where the decision is opaque — those are not this batch's ICP.

A target that fails any of the above is not a Docs-need target for Docloom. Drop them
clean rather than force a pitch that will read as spam.

---

## 8. Anti-spam in this context — what actually matters

The real anti-spam concern for Docloom is not the volume of submissions; it's the
signal-to-noise of the pitch. A perfectly honest demo-first outreach to 14 well-chosen
targets is nothing like spam. A dishonest "I built an AI docs tool" blast to 200
directory listings is spam. Keep the signals honest:

- One contact per company until you have a reason to escalate.
- ≤4 first touches per day for the direct outreach list — and only because real people
  get real emails, not because you're farming a funnel.
- Plain text, one real link, a personalization slot filled honestly every time.
- Stop rules: no reply after B3 → 90-day cooldown; "not interested" → stop; bounce →
  drop (use CSV backups, not invented alternates).

The discovery channels (AlternativeTo, SaaSHub, StackShare, dev.to, IH, GitHub topics,
curated lists) are not "outreach," so the anti-spam concern there is different: it's
about honorable listings. A genuine, honest, once-per-channel listing with a real demo
link is fine. A "submit your startup 60 times" push is not.

---

## 9. Cross-links

- Target list and outreach sequence: `marketing/target-list.md`, `marketing/prospect-emails.md`
- Reddit posts (discovery + complaint-thread answers): `marketing/reddit-posts.md`
- Directory/listing plan + discovery channels: `marketing/listings.md`
- mmccaff list cut: `marketing/mmccaff-strategy.md`
- Launch plan: `marketing/launch-pack.md`
