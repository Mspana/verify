import type { AgreementStrength } from "@verify/shared";

// Small row beneath the verdict showing how strongly TruthScan's
// individual signals agree with the verdict. `disagreement` gets its
// own red accent treatment — see the disagreement banner in ResultPage
// for the more prominent notice; this row just labels the state.

const COPY: Record<AgreementStrength, { label: string; body: string }> = {
  strong: {
    label: "Strong agreement",
    body: "All detection signals point to the same conclusion.",
  },
  moderate: {
    label: "Moderate agreement",
    body: "Most signals support this verdict.",
  },
  weak: {
    label: "Weak agreement",
    body: "Signals lean toward this verdict but aren't conclusive.",
  },
  disagreement: {
    label: "Signals disagree",
    body: "Detection signals conflict. Interpret the verdict with caution.",
  },
};

const BAR: Record<AgreementStrength, { filled: number; accent: string }> = {
  strong: { filled: 4, accent: "bg-ai-accent" },
  moderate: { filled: 3, accent: "bg-ai-accent" },
  weak: { filled: 2, accent: "bg-uncertain-accent" },
  disagreement: { filled: 4, accent: "bg-human-accent" },
};

type Props = {
  agreement: AgreementStrength;
};

export function AgreementRow({ agreement }: Props) {
  const copy = COPY[agreement];
  const bar = BAR[agreement];
  return (
    <div className="flex items-start gap-3 rounded-card border border-border bg-paper p-4">
      <div
        aria-hidden
        className="mt-1 flex flex-col gap-0.5"
        title={copy.label}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`h-1 w-6 rounded-full ${
              i < bar.filled ? bar.accent : "bg-border"
            }`}
          />
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{copy.label}</div>
        <p className="mt-0.5 text-xs text-ink/55">{copy.body}</p>
      </div>
    </div>
  );
}
