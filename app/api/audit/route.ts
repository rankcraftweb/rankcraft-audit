import { NextRequest, NextResponse } from 'next/server';

/**
 * RankCraft Audit API route.
 *
 * Accepts a POST with { url: string }, validates it, then calls Google's
 * PageSpeed Insights API server-side (mobile + desktop) so the API key
 * never reaches the browser. Returns a normalized report shape the
 * frontend can render directly.
 */

// PageSpeed Insights can take up to ~30s per strategy; Vercel's default
// 10s function timeout would cut that off, so extend it explicitly.
export const maxDuration = 60;

interface PageSpeedResult {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

interface AuditResponse {
  url: string;
  mobile: PageSpeedResult;
  desktop: PageSpeedResult;
  fetchedAt: string;
}

const LEADS_ENDPOINT = 'https://rankcraftweb.com/wp-json/rankcraft/v1/leads';
const LEADS_TIMEOUT_MS = 5000;

/**
 * Forwards a captured lead to the WordPress site, server-to-server (no
 * CORS concerns). Best-effort: any failure is caught and logged, never
 * allowed to affect the audit response the frontend is waiting on.
 */
async function postLeadToWordPress(
  name: string,
  email: string,
  url: string,
  mobile: PageSpeedResult,
  desktop: PageSpeedResult
): Promise<void> {
  try {
    const res = await fetch(LEADS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, url, mobile, desktop }),
      signal: AbortSignal.timeout(LEADS_TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Lead capture failed (${res.status}): ${body}`);
    }
  } catch (err) {
    console.error('Lead capture request failed:', err);
  }
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function fetchPageSpeed(
  targetUrl: string,
  strategy: 'mobile' | 'desktop',
  apiKey: string
): Promise<PageSpeedResult> {
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  endpoint.searchParams.set('url', targetUrl);
  endpoint.searchParams.set('strategy', strategy);
  endpoint.searchParams.set('key', apiKey);
  ['performance', 'accessibility', 'best-practices', 'seo'].forEach((cat) =>
    endpoint.searchParams.append('category', cat)
  );

  const res = await fetch(endpoint.toString());

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PageSpeed API error (${strategy}): ${res.status} ${body}`);
  }

  const data = await res.json();
  const categories = data?.lighthouseResult?.categories;

  if (!categories) {
    throw new Error(`Unexpected PageSpeed API response shape (${strategy})`);
  }

  return {
    performance: Math.round((categories.performance?.score ?? 0) * 100),
    accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((categories['best-practices']?.score ?? 0) * 100),
    seo: Math.round((categories.seo?.score ?? 0) * 100),
  };
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.PAGESPEED_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server is not configured. Missing PAGESPEED_API_KEY.' },
      { status: 500 }
    );
  }

  let body: { url?: string; name?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const targetUrl = body.url?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim();

  if (!targetUrl || !isValidUrl(targetUrl)) {
    return NextResponse.json(
      { error: 'Please provide a valid URL starting with http:// or https://' },
      { status: 400 }
    );
  }

  try {
    const [mobile, desktop] = await Promise.all([
      fetchPageSpeed(targetUrl, 'mobile', apiKey),
      fetchPageSpeed(targetUrl, 'desktop', apiKey),
    ]);

    const response: AuditResponse = {
      url: targetUrl,
      mobile,
      desktop,
      fetchedAt: new Date().toISOString(),
    };

    if (name && email) {
      await postLeadToWordPress(name, email, targetUrl, mobile, desktop);
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Could not analyze that URL. Double check it is publicly accessible and try again.' },
      { status: 502 }
    );
  }
}
