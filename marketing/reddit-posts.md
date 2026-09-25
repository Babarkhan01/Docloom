# Reddit drafts — the "docs that refuse to guess" angle (Sep 2026)

**Verdict — post in exactly two communities:**
1. **r/SideProject** — Post 1. The only big sub where "I built this, roast
   it" is the expected format. Indie devs, feedback culture, self-promo
   allowed. Best shot at sub front page.
2. **r/SaaS** — Post 2, 2–3 days later. The question framing matches how
   that sub discusses trust/churn topics. Don't swap: the story post feels
   salesy there; the question post drowns in SideProject.

Skip: r/webdev, r/programming (auto-remove promo from low-karma accounts),
r/startups, r/Entrepreneur (founder-culture, zero click-through for
devtools). Backups if one dies: r/microsaas (Post 1), r/indiehackers or
r/AlphaandBetausers (Post 2).

Mechanics: post 8–10am ET, reply to every comment in the first 2 hours,
check each sub's rules the day of posting. Disclose "I built this" in the
post itself — hidden marketing gets removed; honest indie posts don't.

---

## Post 1 — r/SideProject (story angle)

**Title:**
Every AI docs generator I tried invented endpoints my API doesn't have. So
I built one that can't.

**Body:**

Background: I maintain a small Next.js SaaS and my API docs were a README
that was 3 months stale, like everyone else's.

Last month I tried a bunch of the new AI docs generators. One of them wrote
beautiful docs for a `DELETE /webhooks/:id` endpoint. My codebase does not
have that endpoint. Never did. Made-up params, made-up response codes,
totally confident.

That's when it clicked that this isn't a prompting problem. The model's job
is to produce something plausible. Whether it's true doesn't really enter
into it.

So I went the opposite direction. My tool parses the repo with the
TypeScript compiler first — actual routes, actual zod request bodies,
actual response shapes per status code. Then the AI writes short
descriptions on top of that skeleton. It can't document an endpoint that
isn't in the code, there's just no path for it.

The bit I'm weirdly proud of: when the parser can't prove something from
source, the docs say "not documented in source" instead of guessing. Docs
that admit what they don't know lol.

Tested on dub and cal.com — 57 and 42 endpoints documented, real unedited
output: [https://docloom.babar-wealthpilot.workers.dev/playground]

Only works on Next.js App Router + zod right now, that's the honest scope.
An Express repo gets told "framework not supported" instead of silently
returning empty docs.

Free for 1 public repo, no card. Tell me what sucks about the docs format —
I've been staring at it for weeks and can't tell anymore.

---

## Post 2 — r/SaaS (discussion angle)

**Title:**
Would you trust API docs that are allowed to say "I don't know"?

**Body:**

Genuinely asking because it's a roadmap decision I keep flip-flopping on.

Context: I built a docs generator that reads your Next.js routes and zod
schemas with the TypeScript compiler, then writes docs from that. The AI
only writes the description sentences — endpoints, request fields and
response shapes come from parsing the actual code, so it can't invent an
endpoint the way the general AI-docs tools do.

The part I keep second-guessing: when the parser can't prove something from
source, the docs print "not documented in source" instead of a guess.

The case that forced this: `z.object({a}).extend({b})`. You *can* resolve
`a` by walking the base schema — but then the docs list one field and
quietly imply that's all of them. A partial truth that looks complete. So
the tool refuses and shows the schema name with a pointer to the file
instead.

So, this sub specifically: when you're evaluating a SaaS by its API docs,
what actually kills trust for you — stale docs, guessed docs, or missing
docs? And does "we openly mark the gaps" read as trustworthy or as
unfinished?

Demo if you want to see real output (57 endpoints from dub, 42 from
cal.com): [https://docloom.babar-wealthpilot.workers.dev/playground]

---

## Prepared answer for the inevitable "why not just write OpenAPI?"

> OpenAPI describes what you meant to build, by hand, and rots. This reads
> what the code actually does, every regeneration. Emitting an OpenAPI file
> from the parsed facts is on the roadmap — the AST knows everything a
> hand-written spec does.

**Metric to watch:** demo-link clicks per upvote. Dead clicks but fine
upvotes → title works, body doesn't; move the demo link higher.

---

## OP first comments (post ~10 min after the post, don't sticky)

**Post 1 (r/SideProject):**

> Founder here, on my main account, happy to answer anything about the
> parsing side.
>
> Fun detail I left out of the post: the AI tool that invented
> `DELETE /webhooks/:id` also gave it a 204 response and a retry policy. My
> actual webhook code at the time was… GET. That's the day I stopped
> trusting anything with a confident tone of voice.
>
> If anyone wants to stress-test it — dynamic handlers, schemas split
> across files, weird zod chains — drop a public repo and I'll run it and
> paste the raw output here, warts included.

(The repo-run offer is the engagement engine: every reply becomes a
mini-demo in the comments.)

**Post 2 (r/SaaS):**

> OP here. Let me steelman the other side first: for a 5-endpoint API,
> just write the docs by hand, that's correct, this tool is overkill. Where
> it earns its keep is the 40-endpoint API that changes twice a week —
> hand-written docs are dead on arrival there, and I'd rather have 90%
> verified than 100% stale.
>
> Also, the "not documented in source" lines exist because of a real bug:
> cal.com had a response branch my parser couldn't resolve, and v1 of the
> generator just… omitted it silently. A silent gap looked identical to
> "this endpoint is simple." That was worse than marking the gap, so the
> line exists now.

(Arguing against your own product first is the most credible founder move
on r/SaaS.)

**Hour-one reply rules:** short and specific, never "thanks for the
feedback!" — answer with a detail, a number, or a counter-question.

