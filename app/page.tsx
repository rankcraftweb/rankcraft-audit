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
  mobile: PageSpeedResult;
  desktop: PageSpeedResult;
  fetchedAt: string;
  reportUrl?: string;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResponse | null>(null);

  /**
   * One strategy, one request. Mobile and desktop used to be a single
   * call that ran both server-side and waited on the slower one, which
   * routinely overran the function budget - a desktop run stuck at 45s
   * threw away a mobile run that had finished in 18s. Two requests give
   * each strategy the whole budget.
   */
  async function runStrategy(strategy: 'mobile' | 'desktop'): Promise<PageSpeedResult> {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const [mobile, desktop] = await Promise.all([
        runStrategy('mobile'),
        runStrategy('desktop'),
      ]);

      const audit: AuditResponse = {
        url,
        mobile,
        desktop,
        fetchedAt: new Date().toISOString(),
      };

      setResult(audit);
      // Before the lead post, not after it: the report is ready, and
      // leaving the button spinning through an email send the visitor
      // did not ask for is the delay this whole change set out to
      // remove. The finally below covers the error path.
      setLoading(false);

      if (name && email && typeof window.gtag === 'function') {
        window.gtag('event', 'generate_lead', {
          audited_url: url,
        });
      }

      // The scores are already on screen at this point. Saving the lead
      // and sending the emails is our business, not something to make
      // the visitor sit through, so it runs after the render and only
      // adds the shareable link if it succeeds. A failure here is
      // deliberately invisible to them - it is already alerted on the
      // server side.
      if (name && email) {
        try {
          const leadRes = await fetch('/api/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, name, email, mobile, desktop }),
          });
          const leadData = await leadRes.json();
          if (leadRes.ok && typeof leadData?.reportUrl === 'string') {
            setResult({ ...audit, reportUrl: leadData.reportUrl });
          }
        } catch {
          // Nothing to show the visitor; their report is already up.
        }
      }
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not reach the audit service. Please try again.'
      );
    } finally {
      setLoading(false);
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
        </div>

        <form onSubmit={handleSubmit} className="mt-10 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
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
          </div>
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
              {loading ? 'Analyzing…' : 'Run audit'}
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
            Running Google PageSpeed Insights for mobile and desktop, this can take up to 30 seconds…
          </div>
        )}

        {result && (
          <div className="mt-12">
            <AuditResults mobile={result.mobile} desktop={result.desktop} />
            {result.reportUrl && (
              <p className="mt-6 text-center text-sm text-[#63C89F]">
                Bookmark this report:{' '}
                <a href={result.reportUrl} className="underline hover:text-white">
                  {result.reportUrl}
                </a>
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
