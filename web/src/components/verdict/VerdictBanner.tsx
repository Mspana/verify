import type { Verdict, VerdictLabel } from "@verify/shared";

import { formatPercent } from "../../lib/format";
import { Skeleton } from "../ui/Skeleton";

// The big card at the top of the result page. Three color variants
// keyed by verdict.label, following the paper-warmed palette:
//   human     → red accent on red fill    (likely real; red = auspicious)
//   ai        → green accent on green fill
//   uncertain → amber accent on amber fill
//
// The red/green inversion from Western convention is deliberate — this
// is a China-first product where red reads as the safe, auspicious
// color, so the "likely real" verdict gets it.

const VARIANT: Record<
  VerdictLabel,
  { fill: string; accent: string; chipBg: string }
> = {
  human: {
    fill: "bg-human-fill",
    accent: "text-human-accent",
    chipBg: "bg-human-accent/10",
  },
  ai: {
    fill: "bg-ai-fill",
    accent: "text-ai-accent",
    chipBg: "bg-ai-accent/10",
  },
  uncertain: {
    fill: "bg-uncertain-fill",
    accent: "text-uncertain-accent",
    chipBg: "bg-uncertain-accent/10",
  },
};

type Props = {
  verdict: Verdict;
};

export function VerdictBanner({ verdict }: Props) {
  if (verdict.status === "pending") {
    return <Skeleton className="h-36 w-full" />;
  }
  if (verdict.status === "failed") {
    return (
      <div className="rounded-card border border-paper-edge bg-paper p-6">
        <div className="text-base font-semibold text-ink-muted">
          Verdict unavailable
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          The scan couldn't produce a verdict. Try again with a different image.
        </p>
      </div>
    );
  }

  const v = VARIANT[verdict.label];
  return (
    <section
      aria-labelledby="verdict-headline"
      className={`rounded-card ${v.fill} p-6`}
    >
      <div
        className={`inline-flex items-center gap-1.5 rounded-btn ${v.chipBg} ${v.accent} px-2 py-1 text-xs font-medium uppercase tracking-wide`}
      >
        Verdict
      </div>
      <h2
        id="verdict-headline"
        className={`mt-3 text-3xl font-semibold leading-tight ${v.accent}`}
      >
        {verdict.headline}
      </h2>
      <dl className="mt-5 grid grid-cols-2 gap-4">
        <Metric
          label="AI likelihood"
          value={formatPercent(verdict.aiLikelihood, 1)}
          accent={v.accent}
        />
        <Metric
          label="Confidence"
          value={formatPercent(verdict.confidence, 0)}
          accent={v.accent}
        />
      </dl>
    </section>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-muted uppercase tracking-wide">
        {label}
      </dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>
        {value}
      </dd>
    </div>
  );
}
