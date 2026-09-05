@AGENTS.md

# CLAUDE.md

Guidance for Claude Code (or any future session) working in this repo.
Setup and stack basics are in `README.md` and are not repeated here — this
file covers what the code does not say out loud.

## What this is, and why that matters

RankCraft Audit is the free lead magnet for the RankCraft business. Someone
enters a name, email and URL, gets four Lighthouse scores back, and becomes
a lead in WordPress. The scores are the product the visitor sees; the lead
is the product the business needs. Any change that makes the audit better
but breaks lead capture is a bad trade.

That framing decides a lot of the code below. Lead capture is best-effort
and never blocks the audit response, because a visitor who gets no scores
tells nobody about the tool.

## The request flow

```
page.tsx (client)
  ├─ POST /api/audit  { url, strategy: 'mobile'  }  ─┐ in parallel,
  └─ POST /api/audit  { url, strategy: 'desktop' }  ─┘ one retry each
       ├─ rate limit check (per IP)
       └─ fetchPageSpeed() → PageSpeed Insights
  ← { url, strategy, scores, fetchedAt }
  │
  ├─ render the scores, stop the spinner
  ├─ gtag('generate_lead') fires, only when name+email present
  └─ POST /api/lead  { url, name, email, mobile, desktop }
       └─ WordPress ─ best effort ─┐
            └─ on failure → alertLeadCaptureFailure()
  ← { reportUrl? }  → adds the bookmark line
```

**One strategy per request, deliberately.** Both used to run in one
invocation under `Promise.all`, so a 60s budget had to cover the slower
PageSpeed run plus a 15s WordPress post. Measured 2026-09-05, eight
paired runs over four sites: five exceeded the old 45s ceiling, and
three of those were killed by desktop while mobile had already finished
in 18s. Separate invocations give each strategy the whole budget
(`PAGESPEED_TIMEOUT_MS` is now 55s).

**The retry is not optional decoration.** Splitting alone did not fix
it — the client still awaits both, so one failure sank a finished
result. PageSpeed's slow runs and its 500s look like queue variance, not
anything about the target site: the same URL times out and then answers
in 15s. One retry, capped, because the visitor is waiting.

`reportUrl` is absent whenever lead capture failed. The frontend already
handles that (the bookmark line just does not render) — keep it optional.

**A report can be half a report.** `Promise.allSettled`, not `all`: if
one strategy fails both attempts and the other succeeded, the visitor
gets the half that worked plus a note saying what is missing. Only both
failing is an error. Mobile is the half that decides how Google ranks
them, so half is worth far more than an error page.

A strategy that was never measured is **absent** from the lead payload,
never zeroed — `JSON.stringify` drops `undefined`, and both `/api/lead`
and WordPress reject a payload with neither. Zero is a real score, and a
lead recording 0 across the board would misrepresent the site in the
visitor's own emailed copy. WordPress stores `_rc_measured` alongside
the scores so nothing downstream has to guess whether a 0 is real; an
empty `_rc_measured` means **both** (leads predating the change), not
neither.

## This app is coupled to the WordPress site

Three endpoints on `rankcraftweb.com` are load-bearing here, and none of
them live in this repo:

| Endpoint | Called from | Purpose |
|---|---|---|
| `POST /wp-json/rankcraft/v1/leads` | `app/api/lead/route.ts` | saves the lead, sends two SMTP emails, returns `reportUrl` |
| `POST /wp-json/rankcraft/v1/alert` | `app/api/lead/route.ts` | emails the team when lead capture fails |
| `GET /wp-json/rankcraft/v1/report/{token}` | `app/report/[token]/page.tsx` | serves a shared report |

Both POSTs authenticate with the `X-RankCraft-Secret` header. **Changing the
payload shape on either side breaks the other silently** — the audit still
returns scores, the lead just quietly stops arriving. If you change what is
sent, the WordPress plugin has to change in the same pass.

Report tokens are minted by WordPress, not here, and expire after 90 days.
The expiry copy in `report/[token]/page.tsx` says 90 days; if WordPress ever
changes that window, this string has to follow.

## Environment variables

| Name | Where | Effect if missing |
|---|---|---|
| `PAGESPEED_API_KEY` | Vercel → Settings → Environment Variables | `/api/audit` returns 500 immediately |
| `RANKCRAFT_LEADS_SECRET` | same | audits still work; **every lead is silently dropped** |

Both were verified present and correct on 2026-09-05 by running a real
audit end to end: scores rendered, the lead reached WordPress, and
`reportUrl` came back. So a `0` lead count is not evidence of a broken
pipeline — check GA4 for traffic to `audit.rankcraftweb.com` before
suspecting the code.

Locally both go in `.env.local`, which is gitignored. Never paste either
value into a chat, a commit, or a file in this repo — read them from Vercel
or from the local `.env.local` when they are needed.

The second failure mode is the dangerous one, because nothing visible
breaks. If leads stop arriving, check that variable first.

## Timeouts, and why each number is what it is

- `maxDuration = 60` — Vercel's default function timeout is 10s and
  PageSpeed routinely takes ~30s per strategy. Do not lower this.
- `PAGESPEED_TIMEOUT_MS = 45000` — sits under the 60s function budget so a
  slow PageSpeed call fails with a real message instead of a platform 504.
- `LEADS_TIMEOUT_MS = 15000` — was 5s and timed out client-side while
  WordPress had already succeeded, producing leads that saved but showed
  the visitor a failure. The endpoint sends two SMTP emails before it
  answers; it is genuinely slow.

## The rate limit is deliberately weak

`isRateLimited()` is an in-memory `Map`: 10 audits per IP per hour, reset on
cold start, not shared between concurrent Vercel instances. It exists to
stop casual abuse burning PageSpeed API quota, not attackers. Do not rewrite
it as real infrastructure without a reason — the WordPress leads endpoint
has its own IP throttle behind it.

## Metadata rules — read before touching any `metadata` export

Next.js merges metadata **shallowly** down the route tree. Two consequences
are already load-bearing:

- The root layout has **no `alternates.canonical`**, on purpose. A canonical
  of `/` there would make every `/report/[token]` page claim the homepage as
  its canonical.
- `report/[token]/page.tsx` has **no `openGraph` key**, on purpose. Declaring
  one would replace the root layout's entire Open Graph object — image,
  description, siteName and all — and shared report links would render as
  bare text cards. Inheriting the brand card whole is also what we want: a
  report link passed around should never leak the audited URL or its scores.

The `verification.google` string in the root layout is not a secret and must
stay publicly readable — removing it un-verifies the Search Console property
for `audit.rankcraftweb.com`.

`app/sitemap.ts` lists exactly one URL and carries no `lastModified`. Both
choices are explained in the file; read the comment before "fixing" it.

## Brand

Navy `#0C2A4A` (page background), green `#1D9E75` (accent, CTA, ≥90 score),
light green `#63C89F` (body text on navy), amber `#EF9F27` (50–89), red
`#E24B4A` (<50). Poppins, loaded from Google Fonts in the root layout.
Colors are hardcoded as Tailwind arbitrary values throughout — there is no
token layer, and adding one is not worth it at this size.

Note that `app/globals.css` still carries leftovers from the Next.js
starter: `--font-geist-sans` / `--font-geist-mono` reference fonts this app
does not load, and the `body { font-family: Arial }` rule is overridden by
the Poppins class on `<body>`. Harmless, but do not treat any of it as
intentional design.

## Deploying

Push to `main`. Vercel is connected to this GitHub repo and deploys
automatically — there is no manual step, and no staging environment. The
production domain is `audit.rankcraftweb.com` (CNAME to Vercel).

Because `main` is production, run both of these before pushing anything
non-trivial:

```bash
npm run lint
npm run build
```

`npm run build` is the one that matters — it type-checks, and a TypeScript
error that only surfaces on Vercel means production is already broken by
the time you see it.
