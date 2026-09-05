import ScoreCircle from './ScoreCircle';

interface PageSpeedResult {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

/**
 * Both strategies are optional, because PageSpeed fails one and not the
 * other often enough that throwing away a finished half was the single
 * most common way a visitor ended up with nothing.
 *
 * A missing strategy is left out rather than drawn as four zeros. Zero
 * is a real score, and a card claiming a site scored 0 on everything
 * because Google had a bad minute is worse than saying nothing.
 */
interface AuditResultsProps {
  mobile?: PageSpeedResult;
  desktop?: PageSpeedResult;
}

function ScorePanel({ label, scores }: { label: string; scores: PageSpeedResult }) {
  return (
    <div className="rounded-2xl bg-[#F4F6F9] p-8">
      <h2 className="text-lg font-semibold text-[#0C2A4A]">{label}</h2>
      <div className="mt-6 grid grid-cols-2 gap-6 sm:flex sm:justify-around">
        <ScoreCircle label="Performance" score={scores.performance} />
        <ScoreCircle label="Accessibility" score={scores.accessibility} />
        <ScoreCircle label="Best Practices" score={scores.bestPractices} />
        <ScoreCircle label="SEO" score={scores.seo} />
      </div>
    </div>
  );
}

export default function AuditResults({ mobile, desktop }: AuditResultsProps) {
  const missing = [!mobile && 'Mobile', !desktop && 'Desktop'].filter(Boolean) as string[];

  return (
    <div className="space-y-8">
      {mobile && <ScorePanel label="Mobile" scores={mobile} />}
      {desktop && <ScorePanel label="Desktop" scores={desktop} />}

      {missing.length > 0 && (
        <div className="rounded-2xl border border-[#63C89F]/30 bg-[#0F3A5F] p-6">
          <p className="text-sm text-[#63C89F]">
            <strong className="font-semibold text-white">
              {missing.join(' and ')} could not be measured this time.
            </strong>{' '}
            Google&apos;s PageSpeed service did not answer for{' '}
            {missing.length > 1 ? 'those runs' : 'that run'}. It is a problem on their end rather
            than with your site, and running the audit again usually returns{' '}
            {missing.length > 1 ? 'them' : 'it'}.
          </p>
        </div>
      )}

      <div className="rounded-2xl bg-[#0F3A5F] p-8 text-center">
        <h3 className="text-xl font-semibold text-white">
          Want help fixing what&apos;s holding your site back?
        </h3>
        <a
          href="https://rankcraftweb.com/contact"
          className="mt-4 inline-block rounded-lg bg-[#1D9E75] px-6 py-3 font-medium text-white transition hover:bg-[#178A65]"
        >
          Talk to RankCraft
        </a>
      </div>
    </div>
  );
}
