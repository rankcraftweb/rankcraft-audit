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
  reportUrl?: string;
}

const LEADS_ENDPOINT = 'https://rankcraftweb.com/wp-json/rankcraft/v1/leads';
const ALERT_ENDPOINT = 'https://rankcraftweb.com/wp-json/rankcraft/v1/alert';
// The leads endpoint now generates a report token and sends two emails
// over SMTP before responding, which can take a few seconds - 5s was
// timing out client-side even though WordPress had already succeeded.
const LEADS_TIMEOUT_MS = 15000;

/**
 * Best-effort email to the team when a lead fails to save. Failure here
 * is swallowed too - a broken alert should never take down the audit
 * response, and if rankcraftweb.com itself is unreachable this will
 * fail the same way postLeadToWordPress did, which is an acceptable
 * gap for a lightweight fix.
 */
async function alertLeadCaptureFailure(message: string): Promise<void> {
  try {
    const secret = process.env.RANKCRAFT_LEADS_SECRET;
    if (!secret) return;

    await fetch(ALERT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RankCraft-Secret': secret,
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(LEADS_TIMEOUT_MS),
    });
  } catch (err) {
    console.error('Failure alert itself failed to send:', err);
  }
}

/**
 * Forwards a captured lead to the WordPress site, server-to-server (no
 * CORS concerns). Best-effort: any failure is caught and logged, never
 * allowed to affect the audit response the frontend is waiting on -
 * but now also emails the team instead of only living in Vercel logs.
 */
async function postLeadToWordPress(
  name: string,
  email: string,
  url: string,
  mobile: PageSpeedResult,
  desktop: PageSpeedResult
): Promise<string | undefined> {
  try {
    const secret = process.env.RANKCRAFT_LEADS_SECRET;
    if (!secret) {
      console.error('Lead capture skipped: missing RANKCRAFT_LEADS_SECRET.');
      return undefined;
    }

    const res = await fetch(LEADS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RankCraft-Secret': secret,
      },
      body: JSON.stringify({ name, email, url, mobile, desktop }),
      signal: AbortSignal.timeout(LEADS_TIMEOUT_MS),
    });

    if (!res.ok) {
      const responseBody = await res.text();
      console.error(`Lead capture failed (${res.status}): ${responseBody}`);
      await alertLeadCaptureFailure(
        `Lead: ${name} <${email}>, URL: ${url}\nWordPress responded ${res.status}: ${responseBody}`
      );
      return undefined;
    }

    const data = await res.json();
    return typeof data?.reportUrl === 'string' ? data.reportUrl : undefined;
  } catch (err) {
    console.error('Lead capture request failed:', err);
    await alertLeadCaptureFailure(
      `Lead: ${name} <${email}>, URL: ${url}\nRequest to WordPress threw: ${String(err)}`
    );
    return undefined;
  }
}

/**
 * Very lightweight per-instance rate limit: 10 audits per IP per hour.
 * Backed by an in-memory Map, so it resets on cold start and isn't
 * shared across concurrent Vercel instances - not meant to stop a
 * determined attacker, just casual abuse burning PageSpeed API quota,
 * same spirit as the WordPress leads endpoint's own IP throttle.
 */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const rateLimitHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitHits.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const PAGESPEED_TIMEOUT_MS = 45000;

/**
 * A small typed error so the outer handler can tell a "this site can't
 * be audited" failure apart from a timeout or an unexpected shape,
 * instead of collapsing every failure into one generic message.
 */
class AuditError extends Error {
  constructor(public readonly userMessage: string, cause?: unknown) {
    super(userMessage);
    this.cause = cause;
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

  let res: Response;
  try {
    res = await fetch(endpoint.toString(), {
      signal: AbortSignal.timeout(PAGESPEED_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new AuditError(
        'That site took too long to analyze. It might be slow to respond right now, try again in a moment.',
        err
      );
    }
    throw new AuditError('Could not reach the PageSpeed service. Please try again.', err);
  }

  if (!res.ok) {
    const body = await res.text();
    // PageSpeed returns 400 for sites Lighthouse itself couldn't load
    // (DNS failure, blocked by robots.txt, redirects, timeouts on their
    // end) - that's a "this site" problem, not a "this service" problem.
    if (res.status === 400) {
      throw new AuditError(
        "This site couldn't be analyzed. It may be blocking automated tools, redirecting unexpectedly, or temporarily unreachable.",
        new Error(`PageSpeed API error (${strategy}): ${res.status} ${body}`)
      );
    }
    throw new AuditError(
      'The PageSpeed service had a problem on its end. Please try again in a moment.',
      new Error(`PageSpeed API error (${strategy}): ${res.status} ${body}`)
    );
  }

  const data = await res.json();
  const categories = data?.lighthouseResult?.categories;

  if (!categories) {
    throw new AuditError(
      'Could not analyze that URL. Double check it is publicly accessible and try again.',
      new Error(`Unexpected PageSpeed API response shape (${strategy})`)
    );
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

  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json(
      { error: "You've run several audits in a short time. Please wait a bit before trying again." },
      { status: 429 }
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
      response.reportUrl = await postLeadToWordPress(name, email, targetUrl, mobile, desktop);
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error(err);
    const message =
      err instanceof AuditError
        ? err.userMessage
        : 'Could not analyze that URL. Double check it is publicly accessible and try again.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
