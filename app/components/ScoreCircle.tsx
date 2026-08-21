interface ScoreCircleProps {
  label: string;
  score: number;
}

function scoreColor(score: number): string {
  if (score >= 90) return '#1D9E75';
  if (score >= 50) return '#EF9F27';
  return '#E24B4A';
}

export default function ScoreCircle({ label, score }: ScoreCircleProps) {
  const circumference = 2 * Math.PI * 42;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
          <circle cx="50" cy="50" r="42" stroke="#D6DEE6" strokeWidth="8" fill="none" />
          <circle
            cx="50"
            cy="50"
            r="42"
            stroke={color}
            strokeWidth="8"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-[#0C2A4A]">{score}</span>
        </div>
      </div>
      <span className="text-sm text-[#64748B]">{label}</span>
    </div>
  );
}
