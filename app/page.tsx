'use client';

import { useState } from 'react';
import AuditResults from './components/AuditResults';

interface PageSpeedResult {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

interface AuditResponse {
  url: string;
  // Optional: a strategy PageSpeed never returned is absent, not zeroed.
  mobile?: PageSpeedResult;
  desktop?: PageSpeedResult;
  fetchedAt: string;
  reportUrl?: string;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * The audit is free before the email, not after it.
 *
 * This page used to ask for a name, an email and a URL before showing
 * anything. Measured in GA4 over Aug 8 - Sep 4 2026: 9 people reached
 * it, stayed an average of 12 seconds, and `generate_lead` never fired
 * once. Twelve seconds does not contain typing three fields and waiting
 * for PageSpeed - they were leaving before they submitted. The tool had
 * produced zero leads in its lifetime, and it was not the code: the
 * pipeline was verified working end to end the same day.
 *
 * So the ask moves to after the value. A stranger gives an email for
 * something they have seen; asking first prices a free tool at a cost
 * they cannot yet judge. Someone who declines still leaves having got
 * their scores and seen whose tool gave them.
 */
export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResponse | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [leadLoading, setLeadLoading] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);

  async function requestStrategy(strategy: 'mobile' | 'desktop'): Promise<PageSpeedResult> {
    const res = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, strategy }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Something went wrong. Please try again.');
    }

    return data.scores as PageSpeedResult;
  }

  /**
   * One retry. PageSpeed's slow runs and its 500s are queue variance
   * rather than anything about the site - the same URL times out and
   * then answers in 15s. Capped at one because the visitor is waiting,
   * and two failures in a row mean a third is unlikely to differ.
   */
  async function runStrategy(strategy: 'mobile' | 'desktop'): Promise<PageSpeedResult> {
    try {
      return await requestStrategy(strategy);
    } catch {
      return await requestStrategy(strategy);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setLeadError(null);

    // allSettled, not all: one strategy failing twice must not discard
    // the other, and mobile is the half that decides how Google ranks.
    const [mobileOutcome, desktopOutcome] = await Promise.allSettled([
      runStrategy('mobile'),
      runStrategy('desktop'),
    ]);

    const mobile = mobileOutcome.status === 'fulfilled' ? mobileOutcome.value : undefined;
    const desktop = desktopOutcome.status === 'fulfilled' ? desktopOutcome.value : undefined;

    if (!mobile && !desktop) {
      const reason = mobileOutcome.status === 'rejected' ? mobileOutcome.reason : undefined;
      setError(
        reason instanceof Error && reason.message
          ? reason.message
          : 'Could not reach the audit service. Please try again.'
      );
      setLoading(false);
      return;
    }

    setResult({ url, mobile, desktop, fetchedAt: new Date().toISOString() });
    setLoading(false);

    // Separate from generate_lead on purpose. These two events are the
    // funnel: how many finish an audit, and how many of those hand over
    // an email. Without the first, a zero is unreadable - it cannot say
    // whether nobody ran an audit or nobody converted after one.
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'audit_completed', {
        audited_url: url,
        partial: !mobile || !desktop,
      });
    }
  }

  async function handleLeadSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;

    setLeadLoading(true);
    setLeadError(null);

    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: result.url,
          name,
          email,
          mobile: result.mobile,
          desktop: result.desktop,
        }),
      });

      const data = await res.json();

      if (!res.ok || typeof data?.reportUrl !== 'string') {
        setLeadError('Could not send the report just now. Please try again in a moment.');
        return;
      }

      setResult({ ...result, reportUrl: data.reportUrl });

      if (typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', { audited_url: result.url });
      }
    } catch {
      setLeadError('Could not send the report just now. Please try again in a moment.');
    } finally {
      setLeadLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0C2A4A]">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6">
          <img
            src="/rankcraft-audit-dark.png"
            alt="RankCraft Audit"
            width={203}
            height={36}
            className="h-9 w-auto"
          />
          <a
            href="https://rankcraftweb.com"
            className="text-sm font-medium text-white/70 transition hover:text-white"
          >
            ← Back
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-[#1D9E75]">
            Free Website Audit
          </p>
          <h1 className="mt-3 text-4xl font-bold text-white">
            See exactly where your site stands.
          </h1>
          <p className="mt-4 text-lg text-[#63C89F]">
            Enter your website URL for a free report on performance, accessibility, best practices, and SEO.
          </p>
          <p className="mt-3 text-sm text-white/50">No email needed to see your scores.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-10">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#1D9E75] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-[#1D9E75] px-6 py-3 font-medium text-white transition hover:bg-[#178A65] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Analyzing…' : 'Run free audit'}
            </button>
          </div>
        </form>

        {error && (
          <div className="mt-6 rounded-lg bg-[#FCEBEB] px-4 py-3 text-sm text-[#A32D2D]">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-10 text-center text-[#63C89F]">
            Running Google PageSpeed Insights for mobile and desktop. This usually takes about 20
            seconds, and occasionally a good deal longer while Google works through its queue…
          </div>
        )}

        {result && (
          <div className="mt-12">
            <AuditResults mobile={result.mobile} desktop={result.desktop}>
              {result.reportUrl ? (
                <div className="rounded-2xl border border-[#1D9E75]/40 bg-[#0F3A5F] p-8 text-center">
                  <p className="font-semibold text-white">Sent. Check your inbox.</p>
                  <p className="mt-3 text-sm text-[#63C89F]">
                    Bookmark this report:{' '}
                    <a href={result.reportUrl} className="underline hover:text-white">
                      {result.reportUrl}
                    </a>
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleLeadSubmit}
                  className="rounded-2xl border border-white/10 bg-[#0F3A5F] p-8"
                >
                  <h3 className="text-lg font-semibold text-white">Want to keep this report?</h3>
                  <p className="mt-2 text-sm text-[#63C89F]">
                    I&apos;ll email you a copy and a link you can come back to or send to whoever
                    looks after your site.
                  </p>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#1D9E75] focus:outline-none"
                    />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/40 focus:border-[#1D9E75] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={leadLoading}
                      className="rounded-lg bg-[#1D9E75] px-6 py-3 font-medium text-white transition hover:bg-[#178A65] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {leadLoading ? 'Sending…' : 'Email it to me'}
                    </button>
                  </div>

                  {leadError && <p className="mt-4 text-sm text-[#F4B4B4]">{leadError}</p>}

                  <p className="mt-4 text-xs text-white/40">
                    One email with your results. No list, no newsletter.
                  </p>
                </form>
              )}
            </AuditResults>
          </div>
        )}
      </main>
    </div>
  );
}
