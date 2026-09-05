import type { NextRequest } from 'next/server';

/**
 * Shared pieces of the audit pipeline.
 *
 * These used to live inside app/api/audit/route.ts, when one request did
 * everything. That request ran mobile and desktop through Promise.all
 * and then posted the lead, so a single Vercel invocation had to cover
 * the slower of the two PageSpeed runs plus the WordPress round trip.
 *
 * Measured on 2026-09-05, that did not fit. Eight paired runs against
 * four real sites: five exceeded the 45s PageSpeed ceiling, and because
 * those five were cut off at the ceiling there is no telling how far
 * over they actually went. Three of the five were killed by the desktop
 * run while mobile had already finished - a strategy that finished in
 * 18s still produced an error, because Promise.all waits for both.
 *
 * The work is now split across separate invocations, each with the
 * whole function budget to itself, which is what the constants below
 * assume.
 */

export type Strategy = 'mobile' | 'desktop';

export interface PageSpeedResult {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

/**
 * A small typed error so the route can tell a "this site can't be
 * audited" failure apart from a timeout or an unexpected shape, instead
 * of collapsing every failure into one generic message.
 */
export class AuditError extends Error {
  /**
   * Whether trying again might give a different answer.
   *
   * The client retries a failed strategy once, which is right for a
   * timeout or a PageSpeed 500 - those are queue variance and the same
   * URL often succeeds seconds later. It is wrong for a verdict about
   * the site itself: PageSpeed takes ~19s to decide it cannot load a
   * URL, so retrying that turns a 19s wait into 38s and ends at the
   * same message.
   */
  constructor(
    public readonly userMessage: string,
    cause?: unknown,
    public readonly retryable: boolean = true
  ) {
    super(userMessage);
    this.cause = cause;
  }
}

/**
 * 55s inside a 60s function. One PageSpeed call now has the invocation
 * to itself, where before it had to share 60s with the other strategy
 * and a 15s WordPress post. The 5s left over is for the response to get
 * out; going higher trades a clean "took too long" message for Vercel
 * killing the function, which the visitor sees as a blank failure.
 */
export const PAGESPEED_TIMEOUT_MS = 55000;

export function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

/**
 * Very lightweight per-instance rate limit, backed by an in-memory Map:
 * it resets on cold start and isn't shared across concurrent Vercel
 * instances. Not meant to stop a determined attacker, just casual abuse
 * burning PageSpeed API quota.
 *
 * A factory rather than a single shared counter, so the audit and lead
 * routes count separately - one audit is now two audit calls and one
 * lead call, and sharing a bucket would make those numbers meaningless.
 */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || now > entry.resetAt) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      return false;
    }

    entry.count += 1;
    return entry.count > max;
  };
}

export async function fetchPageSpeed(
  targetUrl: string,
  strategy: Strategy,
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
        new Error(`PageSpeed API error (${strategy}): ${res.status} ${body}`),
        false
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
      new Error(`Unexpected PageSpeed API response shape (${strategy})`),
      false
    );
  }

  return {
    performance: Math.round((categories.performance?.score ?? 0) * 100),
    accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((categories['best-practices']?.score ?? 0) * 100),
    seo: Math.round((categories.seo?.score ?? 0) * 100),
  };
}
