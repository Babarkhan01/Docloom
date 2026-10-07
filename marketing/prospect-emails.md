# Prospect emails — 20-target outreach sequence (Sep 27 – Oct 7, 2026)

Companion to `launch-pack.md` §5. That file holds the targeting strategy and
scoring; this file holds the actual emails. Two tracks, three touches each:

- **Track A — public-repo targets (10).** The hook is *their* docs, generated
  before the first email. Never send email 1 without running their repo first:
  the attachment IS the pitch.
- **Track B — private-repo targets (10).** No demo possible, so the pitch
  leads on the honesty mechanism + the privacy promise, not on output.

Core rule from the Reddit drafts applies here too: lead with a specific fact
about *them* (missing docs/, stale README, single 4-year-old API page), never
with "I built a tool". Subject lines ≤6 words, lowercase, no emojis, no
"quick question" — it reads as a sales opener.

---

## Track A — public-repo targets

### Email A1 (day 0) — "I generated your docs"

**Subject:** `docs for {owner}/{repo}, from the code`

> Hey {first_name},
>
> I was reading {repo}'s API the other day and noticed the docs are
> {observed_gap — e.g. "a README stub from 2023" / "the OpenAPI spec in the
> repo, but nothing rendered" / "spread across three pages, none of them the
> route handlers"}.
>
> So I ran my tool on it. It parses the Next.js App Router handlers with the
> TypeScript compiler first — endpoints, zod request bodies with their
> constraints, per-status response shapes — and only then writes short
> descriptions on top. Nothing gets invented: if the parser can't prove a
> field from source, the doc line says "not documented in source".
>
> Attached: {endpoint_count} endpoints documented from {repo}, unedited.
> If anything in there is wrong, that's a parser bug and I'd genuinely like
> to know about it.
>
> Free for public repos, no signup needed — here's the same thing on your
> own repo anytime: {PLAYGROUND_URL}
>
> {sender_name}

**Attach:** `docs/{repo}-{branch}.md` generated that morning. **Proofread the
generated doc before sending** — one wrong endpoint line kills the entire
premise of the email. If the repo parses to 0 endpoints, do not send this;
move the target to Track B.

### Email A2 (day 3, reply-in-thread) — the proof

**Subject:** `re: docs for {owner}/{repo}, from the code`

> {first_name} — one more concrete thing.
>
> Your {endpoint_or_file — e.g. "POST /v1/keys"} handler reads
> {input_detail — e.g. "three searchParams and a bearer header"}. That's in
> the generated doc, section {n}. A regenerate-on-merge would keep that
> section current automatically; right now it's correct as of commit
> {short_sha}.
>
> If docs-rot is not your problem, tell me and I'll leave you alone — but if
> someone else owns docs for {repo}, forward them the attachment instead of
> me.

**Why the commit sha:** it converts "docs" (a vibe) into "snapshot" (a fact),
and it sets up the auto-regen pitch without saying "pitch".

### Email A3 (day 8, break-up) — the close or the release

**Subject:** `closing the loop on {repo} docs`

> Hey {first_name},
>
> Last note from me. The generated doc for {repo} stays valid until the next
> API change — the permalink to regenerate it fresh is {PLAYGROUND_URL}, takes
> about a minute.
>
> If API docs are ever someone's actual job at {company}, that person is who
> I built this for. Happy to show it on a private branch of yours anytime
> ({STARTER_URL} — $19/mo, free while it's in launch week with LAUNCH50).
>
> Either way, the attachment's yours, no strings.
>
> {sender_name}

---

## Track B — private-repo targets

### Email B1 (day 0) — honesty pitch, privacy first

**Subject:** `{company}'s API docs, without pasting code anywhere`

> Hey {first_name},
>
> Quick context, not a pitch yet: I built a docs generator that refuses to
> guess. It reads Next.js route handlers + zod schemas with the TypeScript
> compiler, and writes API docs only from what the parser can prove. When it
> can't prove something, the doc says "not documented in source" instead of
> inventing a field. There's real output on two well-known repos here:
> {DEMO_URL}
>
> The reason I'm writing to {company} specifically: {personalized_reason —
> "you're shipping weekly and your public docs page hasn't changed since
> {date}" / "your changelog mentions 3 new endpoints this quarter that the
> docs don't"}.
>
> I know the repo is private, so the obvious question is what my servers
> see: metadata and the generated docs — the source itself is read in memory
> during a generation run and dropped. No copy, no index, no training.
> Written down here: {PRIVACY_URL} (§9 for deletion).
>
> Worth a 15-minute look on a branch of your choosing?
>
> {sender_name}

### Email B2 (day 3, reply-in-thread) — handle the objection in advance

**Subject:** `re: {company}'s API docs, without pasting code anywhere`

> {first_name} — the question I'd ask in your position: what does the
> generated doc actually contain for a private repo?
>
> For a typical {n}-endpoint API: the route table, request fields with
> constraints (zod min/max/optional — read from the schemas, not inferred),
> response shapes per status code, and named gaps where a schema couldn't be
> resolved. Sample with a public repo's output attached so you can judge the
> format before trusting it on yours: {DEMO_URL}
>
> Auto-regenerate on merge is the part teams keep once the novelty wears
> off — docs that are stale by Thursday are the reason nobody reads them by
> Q4.

### Email B3 (day 8, break-up) — the LAUNCH50 close

**Subject:** `last one re: {company} docs`

> Hey {first_name},
>
> Closing the loop. Two things you keep if you start now:
>
> 1. LAUNCH50 — 50% off Starter for 3 months, expires {Oct 7}. Starter is
>    the plan private repos live on ($19/mo → $9.50 with the code).
> 2. A generation run on one private branch of yours, screen-shared so you
>    see exactly what leaves your repo. If the output isn't obviously useful,
>    I'll say so and vanish.
>
> If the timing's wrong, reply "later" and I'll check back after your
> {next_release/milestone}. Otherwise: {STARTER_URL}
>
> {sender_name}

---

## Send mechanics (both tracks)

- **From:** a personal address, your name only. No "team@", no product name
  in the From line — reply rates on founder-from lines are the whole game at
  20 targets.
- **Plain text only.** No tracking pixels, no HTML, no unsubscribe footer
  (these are 1:1 personal notes, not a campaign — keeping it true matters at
  this volume).
- **Attachments:** only in Track A, only .md, only generated the same day.
  Track B never attaches anything.
- **Timing:** Tue–Thu mornings, recipient's timezone. Day 0 = the day their
  docs got generated (Track A) — don't batch-generate a week early.
- **Log every send** in the launch-pack target list with date + touch
  number. A2/A3 are replies in the same thread, not new threads.
- **Daily cap for the whole sequence: 4 emails/day** — low volume keeps it
  personal and keeps you out of spam-filter heuristics.

## Personalization checklist (per target, ~10 min)

- [ ] {observed_gap} — check their repo/docs *that day*, quote something specific
- [ ] Track A only: repo generated + output proofread + endpoint_count real
- [ ] {personalized_reason} (Track B) — one fact about their shipping cadence
- [ ] Subject filled with their real repo/company (never send a `{placeholder}`
      subject — that's the one unforgivable send)
- [ ] Links resolve: PLAYGROUND_URL, DEMO_URL, STARTER_URL, PRIVACY_URL
