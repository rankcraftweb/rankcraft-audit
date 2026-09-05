import { NextRequest, NextResponse } from 'next/server';
import {
  AuditError,
  createRateLimiter,
  fetchPageSpeed,
  getClientIp,
  hostnameResolves,
  isValidUrl,
  type PageSpeedResult,
  type Strategy,
} from '@/lib/audit';

/**
 * RankCraft Audit API route.
 *
 * Accepts a POST with { url: string, strategy: 'mobile' | 'desktop' },
 * validates it, then calls Google's PageSpeed Insights API server-side
 * so the API key never reaches the browser.
 *
 * ONE strategy per request. This route used to run both and post the
 * lead as well, which meant a single 60s invocation had to cover the
 * slower PageSpeed run plus a 15s WordPress round trip - and measurement
 * showed that losing most of the time (see lib/audit.ts). The client now
 * fires mobile and desktop as two parallel requests, so each gets a
 * whole invocation, and a slow desktop run can no longer throw away a
 * mobile run that already finished.
 */

export const maxDuration = 60;

interface StrategyResponse {
  url: string;
  strategy: Strategy;
  scores: PageSpeedResult;
  fetchedAt: string;
}

/**
 * 30 rather than 10: one audit is now two calls to this route, and each
 * may retry once, so the old ceiling would have cut what a visitor can
 * actually run to a quarter of what it was meant to be.
 */
const isRateLimited = createRateLimiter(30, 60 * 60 * 1000);

function isStrategy(value: unknown): value is Strategy {
  return value === 'mobile' || value === 'desktop';
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

  let body: { url?: string; strategy?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const targetUrl = body.url?.trim();

  if (!targetUrl || !isValidUrl(targetUrl)) {
    return NextResponse.json(
      { error: 'Please provide a valid URL starting with http:// or https://' },
      { status: 400 }
    );
  }

  if (!isStrategy(body.strategy)) {
    return NextResponse.json(
      { error: "Missing or unknown strategy. Expected 'mobile' or 'desktop'." },
      { status: 400 }
    );
  }

  // Milliseconds, and it saves the visitor up to 110 seconds when they
  // simply mistyped the domain. Not retryable: a name that does not
  // exist will not exist on a second attempt either.
  if (!(await hostnameResolves(new URL(targetUrl).hostname))) {
    return NextResponse.json(
      {
        error: "That domain doesn't seem to exist. Check the spelling and try again.",
        retryable: false,
      },
      { status: 502 }
    );
  }

  try {
    const scores = await fetchPageSpeed(targetUrl, body.strategy, apiKey);

    const response: StrategyResponse = {
      url: targetUrl,
      strategy: body.strategy,
      scores,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error(err);
    const message =
      err instanceof AuditError
        ? err.userMessage
        : 'Could not analyze that URL. Double check it is publicly accessible and try again.';
    // The client retries once, but only where a second attempt could
    // land differently. A verdict about the site would just cost the
    // visitor another ~19s to reach the same message.
    const retryable = err instanceof AuditError ? err.retryable : true;
    return NextResponse.json({ error: message, retryable }, { status: 502 });
  }
}
