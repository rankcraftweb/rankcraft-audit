import type { Metadata } from 'next';
import AuditResults from '../../components/AuditResults';

interface PageSpeedResult {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

interface ReportData {
  success: boolean;
  message?: string;
  url?: string;
  mobile?: PageSpeedResult;
  desktop?: PageSpeedResult;
  fetchedAt?: string;
}

// Shared report links are unlisted, not meant for search results.
//
// No `openGraph` key here, deliberately. Metadata is merged *shallowly*,
// so declaring openGraph in this segment would replace the root layout's
// entire object - image, description, siteName and all - and leave the
// card bare again. Inheriting it whole is also the behaviour we want: a
// report link passed around in Messenger should show the brand, never
// the audited URL or its scores.
export const metadata: Metadata = {
  title: 'Audit Report — RankCraft Audit',
  robots: { index: false, follow: false },
};

async function getReport(token: string): Promise<ReportData> {
  try {
    const res = await fetch(`https://rankcraftweb.com/wp-json/rankcraft/v1/report/${token}`, {
      cache: 'no-store',
    });
    return await res.json();
  } catch {
    return { success: false, message: 'Could not load this report right now.' };
  }
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getReport(token);

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
        {/* One strategy is enough to render a report. WordPress omits a
            strategy it never received rather than storing zeros, so a
            partial report arrives here with one side simply absent. */}
        {report.success && (report.mobile || report.desktop) ? (
          <>
            <div className="text-center">
              <p className="text-sm font-medium uppercase tracking-widest text-[#1D9E75]">
                Website Audit Report
              </p>
              <h1 className="mt-3 text-3xl font-bold text-white break-words">{report.url}</h1>
            </div>
            <div className="mt-10">
              <AuditResults mobile={report.mobile} desktop={report.desktop} />
            </div>
          </>
        ) : (
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              {report.message === 'This report has expired.'
                ? 'This report has expired'
                : 'Report not found'}
            </h1>
            <p className="mt-4 text-[#63C89F]">
              {report.message === 'This report has expired.'
                ? 'Shared audit links stay active for 90 days. Run a new audit to get a fresh report.'
                : "This link doesn't match any audit report."}
            </p>
            <a
              href="https://audit.rankcraftweb.com"
              className="mt-6 inline-block rounded-lg bg-[#1D9E75] px-6 py-3 font-medium text-white transition hover:bg-[#178A65]"
            >
              Run a new audit
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
