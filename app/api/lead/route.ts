import { NextRequest, NextResponse } from 'next/server';
import {
  createRateLimiter,
  getClientIp,
  isValidUrl,
  type PageSpeedResult,
} from '@/lib/audit';

/**
 * Lead capture.
 *
 * Split out of app/api/audit/route.ts, where it ran after both
 * PageSpeed calls inside the same invocation. That put a 15s WordPress
 * round trip on the end of a budget the PageSpeed runs were already
 * overrunning, so a lead could be lost to a timeout that had nothing to
 * do with WordPress.
 *
 * It also means the visitor sees their scores as soon as the two audit
 * requests land, rather than waiting on an email send they have no
 * interest in.
 *
 * The shared secret stays server-side: the browser posts scores here,
 * and this route is the only thing that holds the credential.
 */

export const maxDuration = 60;

const LEADS_ENDPOINT = 'https://rankcraftweb.com/wp-json/rankcraft/v1/leads';
const ALERT_ENDPOINT = 'https://rankcraftweb.com/wp-json/rankcraft/v1/alert';
// The leads endpoint generates a report token and sends two emails over
// SMTP before responding, which can take a few seconds - 5s was timing
// out client-side even though WordPress had already succeeded.
const LEADS_TIMEOUT_MS = 15000;

const isRateLimited = createRateLimiter(10, 60 * 60 * 1000);

/**
 * Best-effort email to the team when a lead fails to save. Failure here
 * is swallowed too - a broken alert should never take down the response
 * - and if rankcraftweb.com itself is unreachable this will fail the
 * same way the lead post did, which is an acceptable gap.
 *
 * Note this needs the same secret as the lead post, so a MISSING secret
 * silences the alert as well as the lead. That is the one failure mode
 * with no outward signal at all.
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
 * Clamp whatever the browser sent into the 0-100 integers WordPress
 * expects. The scores now arrive from the client rather than straight
 * out of fetchPageSpeed, so they are input, not internal state.
 *
 * Returns undefined for a strategy that is absent, and passes that
 * absence through to WordPress rather than substituting zeros. A
 * strategy PageSpeed never answered for is unknown, not a score of nil,
 * and a lead recording 0 across the board would misrepresent the site
 * in the visitor's own emailed report.
 */
function normalizeScores(value: unknown): PageSpeedResult | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Record<string, unknown>;
  const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

  return {
    performance: clamp(raw.performance),
    accessibility: clamp(raw.accessibility),
    bestPractices: clamp(raw.bestPractices),
    seo: clamp(raw.seo),
  };
}

export async function POST(request: NextRequest) {
  if (isRateLimited(getClientIp(request))) {
    return NextResponse.json({ error: 'Too many submissions. Please wait a bit.' }, { status: 429 });
  }

  let body: {
    url?: string;
    name?: string;
    email?: string;
    mobile?: unknown;
    desktop?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const targetUrl = body.url?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim();

  if (!targetUrl || !isValidUrl(targetUrl) || !name || !email) {
    return NextResponse.json(
      { error: 'A name, an email and the audited URL are all required.' },
      { status: 400 }
    );
  }

  const secret = process.env.RANKCRAFT_LEADS_SECRET;
  if (!secret) {
    console.error('Lead capture skipped: missing RANKCRAFT_LEADS_SECRET.');
    return NextResponse.json({ reportUrl: undefined });
  }

  const mobile = normalizeScores(body.mobile);
  const desktop = normalizeScores(body.desktop);

  if (!mobile && !desktop) {
    return NextResponse.json(
      { error: 'At least one of mobile or desktop scores is required.' },
      { status: 400 }
    );
  }

  // JSON.stringify omits undefined values, so a strategy that was never
  // measured simply does not appear in the request WordPress receives.
  const payload = { name, email, url: targetUrl, mobile, desktop };

  try {
    const res = await fetch(LEADS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-RankCraft-Secret': secret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(LEADS_TIMEOUT_MS),
    });

    if (!res.ok) {
      const responseBody = await res.text();
      console.error(`Lead capture failed (${res.status}): ${responseBody}`);
      await alertLeadCaptureFailure(
        `Lead: ${name} <${email}>, URL: ${targetUrl}\nWordPress responded ${res.status}: ${responseBody}`
      );
      return NextResponse.json({ reportUrl: undefined });
    }

    const data = await res.json();
    return NextResponse.json({
      reportUrl: typeof data?.reportUrl === 'string' ? data.reportUrl : undefined,
    });
  } catch (err) {
    console.error('Lead capture request failed:', err);
    await alertLeadCaptureFailure(
      `Lead: ${name} <${email}>, URL: ${targetUrl}\nRequest to WordPress threw: ${String(err)}`
    );
    return NextResponse.json({ reportUrl: undefined });
  }
}
