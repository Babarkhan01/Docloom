# Docloom strategy built from mmccaff/PlacesToPostYourStartup

Source list: `https://github.com/mmccaff/PlacesToPostYourStartup` (mirrored at
PlacesToPostYourStartup.com). That list is a huge *everything bucket* of Reddit
subs + submission sites from a 2010s-era HN thread. Useful as a map, useless
as-is as a strategy — most entries are low-signal or wrong stage for a dev
tool selling on an honest-scope pitch.

This document is the Docloom-specific cut. We keep only places where
**developers evaluating API-doc tooling or dev tools actually look**, rank
them by expected traction for Docloom specifically, and give one strategy
block per keeper: why it fits, what the pitch looks like, what to link, and
when to do it relative to the launch-pack schedule.

Nothing here contradicts what's already in `marketing/listings.md` and
`launch-pack.md` §1–§6 — this is the same plan seen through the mmccaff lens.
If a channel is already handled (PH, Show HN, r/SideProject, r/SaaS, Indie
Hackers, BetaList, AlternativeTo, SaaSHub, StackShare), we're just now
explaining *why* and *how to do it without wasting energy on the noise*.

---

## 0. How to read this cut

Three tiers in this file, by expected traction for Docloom specifically:

- **Pursue now (launch week → week 1)** — high enough signal and dev-tool fit
  that it's worth the write-up effort and the real channel energy.
- **Pursue carefully (week 1–2, one shot each)** — a real audience but risky
  execution: either because the community hates promos or because the place
  rewards quality over volume.
- **Skip for now / revisit later** — real in absolute terms but low fit for a
  dev tool selling on scope honesty, or too early-saturation sensitive, or
  would require fake reviews / astroturfing to matter. We do **not** do those
  now; if Docloom later has a real user base, revisit.

The mmccaff list has a lot of generic "submit startup" sites (Startup Stash,
Startup Tabs, Startup Tracker, Startup Ranking, Startup Base, Startup Beat,
>Tiny Launch, etc.). The honest read for Docloom: **these are not the lever.**
A good playground + real demo links + a dev-tool angle beat a 50-site
submission graveyard every time. We keep the best four or five submission
sites, ignore the rest.

---

## 1. Pursue now — launch week / week 1

### 1.1 Reddit — the subs that actually fit Docloom

From the mmccaff Reddit section, these matter for Docloom:

| Sub | Why it fits Docloom | Which angle / post from launch pack maps | Link to use |
| --- | --- | --- | --- |
| r/SideProject | forgiving MVP/indie post culture; feedback-driven | r/SideProject story post from `reddit-posts.md` | playground link (or `?repo=` deep link for any live demo repo) |
| r/SaaS | dev-tool-adjacent; question framing works here | r/SaaS discussion post from `reddit-posts.md` ("would you trust docs that say I don't know?") | playground link |
| r/indiehackers **in Reddit** or IH site | build-in-public audience; builders, not buyers only | build-in-public style post linking to demo | playground link |
| r/microsaas | backup to r/SideProject if one dies; smaller but real | same story angle trimmed shorter | playground link |
| r/AlphaandBetausers | backup for "try my thing" posts if main subs give friction | short demo-first post | playground link |
| r/shamelessplug | literally "post your thing here" — useful only as a dump, not a strategy source | slim post if you're behind on launch energy | playground link |
| r/IMadeThis | maker-post friendly; smaller | light maker post | playground link |

**Reddits to treat as low-fit / risky for Docloom at launch:**

- r/Entrepreneur, r/startups, r/Coupons, r/SmallBusiness — founder-culture or
  small-biz audiences, not the dev-tool buyer; low click-through for a dev tool.
- r/Design_Critiques, r/LadyBusiness — wrong axis entirely.
- r/plugyourproduct, r/thesidehustle — noise-heavy; dodging spam perception is
  hard, and the audience isn't the dev-tool evaluator we want.

**Reddit execution rules for Docloom (these matter more than the sub choice):**
- Lead with the demo, not the product. The angle is "here's real output from a
  real repo, docs from source, not from the model." A post that's "check out
  Docloom" without a demo link will be read as promo; a post with a playground
  link and real generated docs is a genuine share.
- Use the pre-written reddit-posts.md body copy for r/SideProject and r/SaaS —
  it's already shaped for those subs and includes the OP steelman reply for
  r/SaaS.
- Post one sub at a time with enough gap to read the room. Do not cross-post
  the same copy to 4 subs the same day — Reddit will read as spam even if the
  content is legit.
- If a sub removes the post, don't repost the same thing there then. Drop it
  and try the backup sub if it still makes sense.
- Use the `?repo=` deep links on the playground only when that repo actually
  produces good output (from `target-list.md` logic). Otherwise plain playground.

### 1.2 Show HN — from the mmccaff "Show HN" entry

mmccaff lists HN's Show HN. That's exactly where Docloom's launch-fit technical
audience is. Already planned in `launch-pack.md` §2. Strategy note: post it as
"Show HN," not "Ask HN." Use the draft already in the launch pack; the HN
audience will push back on claims, so make sure the claim "every fact comes from
the AST" is defensible with the demo and the eval script.

### 1.3 Product Hunt — from the mmccaff "Product Hunt" entry

Already planned in `launch-pack.md` §1. If the PH page is live, PH is a launch
day + the 24h after. The mmccaff list is right that PH is "the gold standard"
for a launch spike — but only if the gallery and maker comment are done right.
Use the launch-pack gallery slides (hero / facts-first / honest gaps / regen on
merge / pricing) and the pre-written maker comment.

### 1.4 BetaList — from the mmccaff "Beta List" entry

Already in `listings.md` Tier 1. Good beta/launch listing, free tier if
available, dev-tool tag. Strategy note: list Docloom as a dev tool, not a
general "AI startup," because the audience on BetaList skews startup/tech.
Use a short honest description + playground link.

### 1.5 Indie Hackers — from the mmccaff "Indie Hackers" entry

Already in `listings.md` Tier 1. IH is a real builder audience and rewards the
build story. If you post on IH, lead with the AST-first build story and the
honest-scope tradeoff ("we chose to be incomplete-over-wrong"), link to the
demo playground, and keep revenue/UVP light early if traction is thin. A post
like "how we made docs that refuse to guess" with a demo link is stronger than
a product-promo post.

---

## 2. Pursue carefully — week 1–2, one shot each

These are legit channels but need care or they don't help and can hurt.

### 2.1 AlternativeTo — from the mmccaff "Alternative To" entry

`https://alternativeto.net/` — strong fit in principle: people search "alternative
to Swagger / Postman docs / Redoc / Stoplight / ReadMe" and Docloom's honest
docs-from-source angle is a real alternative story. Keep in scope with a careful
pitch: not "replaces everything," but "for code-first devs who want API docs from
source, not an OpenAPI editor or a design-first tool." Submit after launch, one
submission, honest description. See `listings.md` for the trimmed angle and the
max-length copy block.

### 2.2 SaaSHub — from the mmccaff "SaaSHub" entry

`https://www.saashub.com/` — clean category directory; "[your product] alternatives"
intent. Tag as Developer Tools / API Documentation; keywords Next.js, TypeScript,
zod. Submit after launch, short honest description.

### 2.3 StackShare — from the mmccaff "Stack Share" entry

`https://stackshare.io/` — developers evaluate tools in their stack; good place to
be found by engineers, not buyers. List Docloom as a tool alongside GitHub/Next.js
in engineering workflows; not an infra tool. Submit after launch.

### 2.4 Starter Story — from the mmccaff "Starter Story" entry

`https://starterstory.com/` — founder story angle, similar to IH but more "how I
started the project" than "build in public." Could work as a one-shot if you want
the builder story out there. Only worth the write if you have a real origin story
worth telling; otherwise deprioritize.

### 2.5 Website + directory renames that are still "submit a startup" sites

From the mmccaff list, a few of the "submit startup" sites are still
submission-oriented but low fit for a dev tool at launch. Pursue **one shot only if
you have spare launch energy and the site clearly shows dev tools**:

- **Postmake** (`https://postmake.io/submit`) — SaaS directory; fine as one shot if
  the category fits.
- **StartupBlink** (`https://www.startupblink.com/`) — ranking/discovery; worth one
  short listing after launch.
- **Startup88 / Startup Base / Startup Tabs / Startup Tracker** — submission sites
  but lower signal; try at most one if you're already doing directory farming and stop
  after.
- **Starter Story** — keep if you want a founder-story distribution point; else skip.

### 2.6 Dev-focused curated / "awesome" lists (not on mmccaff directly, but same play)

Not every valuable place is on the mmccaff list. For Docloom, the more valuable
places are dev-tool-adjacent curated lists and community threads:

- awesome-nextjs-adjacent lists / API docs lists / developer-tools roundups where a
  curated entry would actually be seen.
- GitHub Discussions / community threads where someone asks "how do you handle API
  docs for a fast-moving Next.js app?" — answer the question with the demo-first
  pitch, link to the playground, and stop. Do not turn every such thread into a
  listing.

---

## 3. Skip for now / revisit later

### 3.1 Skip at launch (wrong stage or wrong fit)

- Trust/review sites that require real reviewed users and ongoing upkeep (G2 Crowd
  `g2crowd.com/products/new`, Capterra `capterra.com/vendors/sign-up`, Software
  Advice, GetApp, G2 alternatives) — queue them after there are real signups. The
  mmccaff list folds them in as "submit startup" sites; Docloom should not pretend
  to be a reviewed enterprise product at launch.
- Crunchbase (`crunchbase.com/#/home/index`) and similar legitimacy/profile sites —
  worth doing once you have an org profile / some funding signal or simply for the
  company-name search lift; not a launch lever.
- Generic "app marketplace" submission sites that do not surface dev tools
  (appoid, appPicker, Apps Listo, Apps Mamma, AppsThunder, Appvita, Web App Rater,
  App Rater, etc.) — wrong audience; skip.
- Startup PR sites that want a press pitch (Startup Beat, Tech Pluto, Startup Inspire,
  Killer Startups, State of Tech) — worth only if you have a real story angle and a
  willingness to pitch; not a default play for a dev tool.
- Review-aggregator / listing-farm directories that reward volume over quality — they
  are the "submit and get buried" part of the mmccaff list. We do not do these to
  chase backlinks that don't convert.

### 3.2 Why not chase the whole list

The trap the mmccaff list tempts you into: treating "100+ platforms" as a numbers
game. For Docloom, the audience that matters is developers with a Next.js + zod repo
and a docs problem. That audience concentrates in:

- launch-day attention (PH / Show HN)
- dev forums (Reddit dev-tool subs, IH, dev.to)
- discovery intent (AlternativeTo / SaaSHub / StackShare searches)
- direct outreach (from the 14-target list and future GitHub search targets)

A 50-site submission push would burn time and produce mostly dead links and
low-signal profiles. A tight 6–10 channel play with real demo links beats it.

---

## 4. mmccaff list entries that doubled as "do we have the angle right?"

A few entries in the mmccaff list are useful less as distribution and more as a
mirror for whether Docloom's positioning is honest:

- **AlternativeTo and Slant** (`slant.co`) both exist because people search for
  alternatives to named tools. If you list Docloom anywhere there, the right answer
  is "you're comparing Docloom to X on the axis of truth/guessing, not just features."
- **Product Hunt + Show HN + IH** — mmccaff lists all three and they're exactly the
  launch-week trio for a dev tool like Docloom. The mmccaff list being right here is
  reassuring, not surprising.
- **BetaList + Beta Bound + Beta Testing and the zillion "submit beta" sites** — for
  a beta/dev-tool launch, BetaList is the one worth doing; the others are lower-signal
  "submit" forms.

---

## 5. Recommended submission order and pace (Docloom-specific)

**Launch week (do these with care, not all in one morning):**
1. Product Hunt — launch day
2. Show HN — 1–2 days after PH
3. Reddit r/SideProject — same week, demo-first
4. Reddit r/SaaS — 2–3 days after SideProject
5. Indie Hackers — after PH, build-in-public post
6. BetaList — after PH live, one short honest entry

**Week 1–2 (one shot each, only if energy allows):**
7. AlternativeTo
8. SaaSHub
9. StackShare

**After that (revisit when there are real users):**
10. Starter Story (if you actually want a founder-story post)
11. G2 / Capterra / Trustpilot / TrustRadius (when there are real signups to review)

Everything else in the mmccaff list: skip unless you have a specific reason to try
one more. A defensible strategy for Docloom is: the six launch-week channels + two
to three careful submission sites + direct outreach. Not 60.

---

## 6. Anti-spam / quality rules (mmccaff edition)

- Do **not** submit Docloom to the same site twice under different names or angles.
- Do **not** use the same copy paste across 4+ subs or 10+ directories in one burst —
  that's how you get read as spam and how listings get removed.
- Do **not** list Docloom as a general AI docs tool on a site where that's the only
  available angle. The honest scope (Next.js App Router + zod, AST-verified, gaps
  labeled "not documented in source") is both the differentiator and the honesty
  constraint; listings that sand that off waste the only thing that makes Docloom
  different.
- Do **not** solicit fake reviews on the trust-site tier. If a review site asks you
  to "invite customers to review" in a spammy way, that's a sign to skip that site.
- Keep one stable link per submission. Prefer the public playground URL (with real
  generated demo) over a signup-only URL when the site allows a "try it" link. If a
  site only allows one URL and you want both demo + signup, lead with the playground.

---

## 7. Cross-links

- Launch plan: `marketing/launch-pack.md` §1–§6
- Directory/listing plan (the keeper cut of the mmccaff list + the non-mmccaff dev
  angles): `marketing/listings.md`
- Direct outreach plan and target list: `marketing/target-list.md`
- Email/DM templates: `marketing/prospect-emails.md`
- Reddit post drafts: `marketing/reddit-posts.md`
