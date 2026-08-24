import ScoreCircle from './ScoreCircle';

interface PageSpeedResult {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}

interface AuditResultsProps {
  mobile: PageSpeedResult;
  desktop: PageSpeedResult;
}

export default function AuditResults({ mobile, desktop }: AuditResultsProps) {
  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-[#F4F6F9] p-8">
        <h2 className="text-lg font-semibold text-[#0C2A4A]">Mobile</h2>
        <div className="mt-6 grid grid-cols-2 gap-6 sm:flex sm:justify-around">
          <ScoreCircle label="Performance" score={mobile.performance} />
          <ScoreCircle label="Accessibility" score={mobile.accessibility} />
          <ScoreCircle label="Best Practices" score={mobile.bestPractices} />
          <ScoreCircle label="SEO" score={mobile.seo} />
        </div>
      </div>

      <div className="rounded-2xl bg-[#F4F6F9] p-8">
        <h2 className="text-lg font-semibold text-[#0C2A4A]">Desktop</h2>
        <div className="mt-6 grid grid-cols-2 gap-6 sm:flex sm:justify-around">
          <ScoreCircle label="Performance" score={desktop.performance} />
          <ScoreCircle label="Accessibility" score={desktop.accessibility} />
          <ScoreCircle label="Best Practices" score={desktop.bestPractices} />
          <ScoreCircle label="SEO" score={desktop.seo} />
        </div>
      </div>

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
