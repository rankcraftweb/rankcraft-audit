# RankCraft Audit

Free website audit tool, part of the RankCraft ecosystem. Enter a URL, get an
instant performance, SEO, and accessibility report powered by Google
PageSpeed Insights.

## Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- Google PageSpeed Insights API (server-side, key never exposed to the browser)
- Deployed on Vercel

## Local development

1. Copy `.env.local.example` to `.env.local`
2. Add your PageSpeed Insights API key (get one at [console.cloud.google.com](https://console.cloud.google.com/apis/credentials))
3. Install dependencies and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Deployed via Vercel, connected to this GitHub repo for automatic deploys on
push to `main`. The `PAGESPEED_API_KEY` environment variable must be set in
the Vercel project settings (Settings → Environment Variables), it is not
committed to the repo.

Domain: `audit.rankcraftweb.com` (CNAME pointing to Vercel)

## How it works

1. User submits a URL via the form on the homepage
2. The form calls `POST /api/audit`
3. The API route validates the URL, then calls Google's PageSpeed Insights
   API twice (mobile and desktop strategy), server-side
4. Results are normalized and returned to the frontend
5. Frontend renders scores as circular progress indicators, matching the
   RankCraft brand (navy `#0C2A4A`, green `#1D9E75`)

## Roadmap

- [ ] Add schema markup / structured data validation as an additional check
- [ ] Store submissions (lead capture) as a foundation for the future
      RankCraft Business System
- [ ] PDF export of the report
