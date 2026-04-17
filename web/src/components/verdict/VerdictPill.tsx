import type { Verdict, VerdictLabel } from "@verify/shared";

// Small pill used on history rows and anywhere we need a compact
// verdict indicator. The red/green inversion (red = human, green = AI)
// is intentional — this is a China-first product where red reads as
// auspicious, so the "safe" verdict gets the auspicious color.

const LABEL_COPY: Record<VerdictLabel, string> = {
  human: "Likely real",
  ai: "AI generated",
  uncertain: "Can't verify",
};

const LABEL_CLS: Record<VerdictLabel, string> = {
  human: "bg-human-fill text-human-ink",
  ai: "bg-ai-fill text-ai-ink",
  uncertain: "bg-uncertain-fill text-uncertain-ink",
};

type Props = {
  verdict: Verdict;
  className?: string;
};

export function VerdictPill({ verdict, className = "" }: Props) {
  if (verdict.status === "pending") {
    return (
      <span
        className={`inline-flex items-center rounded-btn px-2 py-1 text-xs bg-paper-alt text-ink/55 ${className}`}
      >
        Scanning…
      </span>
    );
  }
  if (verdict.status === "failed") {
    return (
      <span
        className={`inline-flex items-center rounded-btn px-2 py-1 text-xs bg-paper-alt text-ink/55 ${className}`}
      >
        Failed
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-btn px-2 py-1 text-xs font-medium ${LABEL_CLS[verdict.label]} ${className}`}
    >
      {LABEL_COPY[verdict.label]}
    </span>
  );
}

export { LABEL_COPY as verdictLabelCopy, LABEL_CLS as verdictLabelClasses };
