# Target list — CSV triage (Sep 27, 2026)

Source: `small_saas_founders_api_docs_leads_20260926113114.csv` (30 rows →
**14 companies after dedupe**). Goal: maximize signups, minimize friction,
stay nowhere near spam.

Companions: `prospect-emails.md` (the A/B sequences), `launch-pack.md` §5
(strategy). Playground deep links below use `{PLAYGROUND_URL}` — the deployed
base URL.

---

## 0. Read this first — honest fit assessment

The CSV was filtered on firmographics only (Software Publishers / 11–50
employees / $5–10M). Before ranking, I checked GitHub directly (Sep 27):

| Checked (Sep 27)                       | Result                                                    |
| -------------------------------------- | --------------------------------------------------------- |
| `lightdash/lightdash`                  | Public TS monorepo, but **0 App Router `route.ts` files** |
| `NangoHQ/nango` (12.4k★)               | Public TS monorepo, **1 `route.ts`** — an Express lib     |
| `pixiebrix/pixiebrix`                  | 404 (renamed/moved — re-verify before use)                |
| `thirdweb-dev/js`, `Qovery/engine`     | Public, TS/Rust SDK-infra — not App Router APIs           |

**Consequence:** this batch contains **no confirmed "public Next.js App
Router repo" Track A demo targets**. The launch-pack rule stands: don't fake
the "I generated your docs" email when the repo wouldn't parse. So all 14 go
out as **Track B** (honesty pitch + privacy + LAUNCH50), ranked by fit. This
is also why the deep-link feature was built *now* — it's the Track B
friction-killer: the CTA lands them on a pre-filled playground instead of a
signup wall.

**Quick wins to upgrade to Track A later** (worth 30 min before sending):
- Verify where PixieBrix moved on GitHub.
- Check each company's secondary repos (docs sites, examples orgs) for
  `route.ts` — any hit converts that company to Track A with real output.

---

## 1. Tier 1 — send first (API-first products, developer audiences)

Highest signup probability: their buyers are developers, docs rot fastest,
and the "docs that refuse to guess" angle maps 1:1 onto what they sell.

| # | Company (contact)               | Email                        | Angle — personalize with this                                       | Deep link CTA                                                                        |
| - | ------------------------------- | ---------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1 | **Nango** (Robin Guldener, CEO) | robin@nango.dev              | They sell integrations — their customers' #1 docs complaint is auth/request shapes. "Docs your integration builders can trust" | `{PLAYGROUND_URL}/playground?repo=NangoHQ%2Fnango`                                     |
| 2 | **thirdweb** (Jake Loo, CTO)    | jake@thirdweb.com            | 12k★-scale SDK docs; API reference accuracy is their brand. Honest-gap line resonates with web3 devs burned by generated docs | `{PLAYGROUND_URL}/playground?repo=thirdweb-dev%2Fjs`                                   |
| 3 | **Lightdash** (Hamzah Chaudhary, CEO) | hamzah@lightdash.com   | Open-core BI with a public REST API + OSS repo; community contributors need current API docs | `{PLAYGROUND_URL}/playground?repo=lightdash%2Flightdash`                               |
| 4 | **Qovery** (Romaric Philogène, CEO) | romaric@qovery.com       | Self-service infra = API-first product; their API docs page is marketing for their engine | `{PLAYGROUND_URL}/playground?repo=Qovery%2Fengine` (honest note: engine is Rust — the link shows the method, not their stack) |
| 5 | **Scenario** (Emmanuel De Maistre, CEO) | emmanuel@scenario.com | Gen-AG gaming assets API — API-first SaaS; fresh funding era = docs drift | `{PLAYGROUND_URL}/playground` (no repo link — private API)                             |

**Deep-link honesty rule:** only point a deep link at a repo when the
expected result is *good docs*. Nango's link parses to ~1 endpoint — that's
an honest demo of the method on their own monorepo, and the email must say
"your API is private, this is the method on your public repo." Never send a
deep link that produces "0 endpoints" or an unsupported-framework warning —
that demonstrates the product failing.

### Sending order within Tier 1

1. **Nango** — closest ICP overlap (they literally sell API infrastructure).
2. **thirdweb** — highest docs-visibility brand pressure.
3. **Lightdash** — OSS community amplifies any docs improvement.
4. **Qovery** — API-first, but weakest repo-docs link.
5. **Scenario** — private API, pure Track B pitch.

## 2. Tier 2 — send in week 1, batch B (the rest, strongest personalization first)

| #  | Company (contact)                        | Email                     | Angle — personalize with this                                      | Deep link CTA                                      |
| -- | ---------------------------------------- | ------------------------- | ------------------------------------------------------------------ | -------------------------------------------------- |
| 6  | **Crystal** (Drew D'Agostino, CEO)       | drew@crystalknows.com     | Personality-data API; docs accuracy = trust in the data itself     | `{PLAYGROUND_URL}/playground`                      |
| 7  | **Portable** (Ethan Aaron, CEO)          | ethan@portable.io         | Climate/fleet APIs for operations teams; small team, docs rot silently | `{PLAYGROUND_URL}/playground`                  |
| 8  | **Tarteel AI** (Mohamed Moussa, CTO)     | mohamed@tarteel.ai        | ML API product; "not documented in source" beats an LLM guessing their inference params | `{PLAYGROUND_URL}/playground` |
| 9  | **Dock** (Alex Kracov, CEO)              | alex@dock.us              | Sales-enablement platform with customer-facing share links; API docs support their ecosystem play | `{PLAYGROUND_URL}/playground` |
| 10 | **PixieBrix** (Todd Schiller, CEO)       | todd@pixiebrix.com        | Browser extensibility platform — integration-heavy; re-verify repo first | `{PLAYGROUND_URL}/playground`                |
| 11 | **Zoko** (Aromal Sivadasan, CTO)         | aromal@zoko.io            | WhatsApp-commerce API; messaging APIs change weekly — regen-on-merge pitch | `{PLAYGROUND_URL}/playground`                  |
| 12 | **myDevices** (Kevin Bromber, CEO)       | kbromber@mydevices.com    | IoT platform; hardware+cloud API surface, docs spread thin         | `{PLAYGROUND_URL}/playground`                      |
| 13 | **Offsight** (Vikas Murali, CEO)         | vikas.murali@offsight.com | Construction-tech SaaS; smaller dev brand, keep email extra plain  | `{PLAYGROUND_URL}/playground`                      |
| 14 | **Digital Awesome** (Brady Halse, CRO)   | brady@digitalawesomeapps.com | Agency-style product shop — weakest ICP fit; send last or drop  | `{PLAYGROUND_URL}/playground`                      |


## 3. Contact selection (why these people)

One contact per company, chosen by decision power × reply likelihood:

- **CEO-first** for ≤20-person-style orgs in this list — founders answer
  their own mail at this size, and docs is a "does anyone own this?"
  question only the founder can settle.
- **CTO where the CTO is the product voice** (thirdweb/Jake Loo, Zoko/Aromal,
  Tarteel/Mohamed, Portable/Sergio — Sergio is the Tier-2 alternate if Ethan
  doesn't reply).
- **Never two contacts from one company in the same week.** Second contact
  only after 5 business days of silence, with the B2 touch, never B1.

Full backup contacts (from the CSV, in order): Nango → Bastien Beurier;
Dock → Victor Kmita; Lightdash → Oliver Laslett; Qovery → Morgan Perry;
Scenario → Hervé Nivon; Portable → Sergio De La Cruz; Crystal → Paul Jones;
PixieBrix → (no second contact in CSV).

**Dropped as duplicates:** Arjun V Paul (Zoko row 11), Furqan Rydhan
(thirdweb), Victor Kmita (Dock), Oliver Laslett (Lightdash), Paul Jones
(Crystal), Sergio De La Cruz (Portable, promoted to backup), Hervé Nivon +
Emmanuel N. (Scenario), Anas A. (Tarteel), Morgan Perry + Queta + Hakob
(Qovery), Luc Chaissac (Dock), Michael Mirandi (PixieBrix, kept Todd as CEO).

## 4. Anti-spam rails (hard rules)

1. **Volume:** ≤4 first-touch emails/day (14 targets ≈ 4 sending days).
   Never the whole list in one morning — deliverability at $5–10M companies
   runs through corporate filters that profile sudden volume.
2. **One thread per person:** A1/B1 opens the thread; A2/B2 reply into it.
   Never a fresh thread for a follow-up.
3. **No images, no HTML, no tracking pixels, one link style** (plain URL).
   The deep-link URL is the only "rich" element in the email.
4. **Every first line is unique and verifiable** — a repo fact, a shipping
   fact, a docs-page observation. If you can't fill the personalization
   slot honestly, the target waits until you can.
5. **Stop conditions:** no reply after B3 → mark closed, no re-contact for
   90 days. Reply "not interested" → same. Bounce → drop, don't guess
   alternate addresses from the CSV beyond the listed backups.
6. **Opt-out line in B1 only** — "if this isn't yours to care about, a one-
   word 'pass' works" — gives a graceful exit without unsubscribe-footer
   spam signals.
7. **LAUNCH50 expiry (Oct 7) is a real deadline, not invented urgency** —
   never restate it after it passes.

## 5. Deep-link mechanics (why the link converts)

`/playground?repo=owner/name` now pre-fills the form (and says so in the
placeholder). What the prospect experiences: click → their repo already in
the box → one click → AST-verified docs. No typing, no signup, no card.
Signup only appears *after* value ("save & publish these docs"), which is
the funnel's designed conversion point.

- **Tier 1 rows 1–4:** personalized deep link (their public repo).
- **Everyone else:** plain `{PLAYGROUND_URL}/playground` — deep links only
  where they demonstrably produce good output.
- **UTM discipline:** append `?utm_source=outreach&utm_campaign=launch26`
  *outside* the shared link (your sends only) so PostHog can attribute
  signups → the target list. Never put UTMs in a prospect-facing email where
  they read as marketing.

## 6. Tracking

Log every send in the table above (date + touch #) or in a copy of it.
Funnel: email → deep-link click (PostHog `cta_clicked`) →
`playground_generated` → signup → repo connect. Target for this batch:
**≥3 signups from 14** (launch-pack leading indicator: published docs per
signup ≥20%).
