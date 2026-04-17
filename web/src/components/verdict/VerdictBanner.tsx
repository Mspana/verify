import type { Verdict, VerdictLabel } from "@verify/shared";

import { formatPercent } from "../../lib/format";
import { Skeleton } from "../ui/Skeleton";

// The verdict card at the top-right of the result page (or full-width
// on mobile). Structure per 03-result-detail-ai.html verdict-banner
// and 05-pending-and-disagreement.html:
//
//   [dot] EYEBROW (bilingual, 11px weight 500)
//   Headline (22px weight 500, verdict-ink color)
//   Sub copy  (13px, verdict-ink @ 0.8 opacity)
//   AI likelihood       90.2%
//   [  confidence bar   ]
//
// Accent = dot + conf bar fill.  Ink variant = headline + sub + label text.
// Red/green inversion (human=red, ai=green) is intentional per brief.

const EYEBROW: Record<VerdictLabel, string> = {
  human: "人工 · HUMAN",
  ai: "AI 生成 · AI",
  uncertain: "不确定 · UNSURE",
};

const SUB: Record<VerdictLabel, string> = {
  human: "This image appears to be human-made.",
  ai: "This image was likely made by AI.",
  uncertain: "We're not confident either way.",
};

const FILL: Record<VerdictLabel, string> = {
  human: "bg-human-fill",
  ai: "bg-ai-fill",
  uncertain: "bg-uncertain-fill",
};
const INK: Record<VerdictLabel, string> = {
  human: "text-human-ink",
  ai: "text-ai-ink",
  uncertain: "text-uncertain-ink",
};
const DOT: Record<VerdictLabel, string> = {
  human: "bg-human-accent",
  ai: "bg-ai-accent",
  uncertain: "bg-uncertain-accent",
};
const BAR_TRACK: Record<VerdictLabel, string> = {
  human: "bg-human-accent/25",
  ai: "bg-ai-accent/25",
  uncertain: "bg-uncertain-accent/25",
};
const BAR_FILL: Record<VerdictLabel, string> = {
  human: "bg-human-accent",
  ai: "bg-ai-accent",
  uncertain: "bg-uncertain-accent",
};

type Props = {
  verdict: Verdict;
};

export function VerdictBanner({ verdict }: Props) {
  if (verdict.status === "pending") {
    return <Skeleton className="h-[152px] w-full rounded-[13px]" />;
  }
  if (verdict.status === "failed") {
    return (
      <div className="rounded-[13px] border border-border bg-paper p-5">
        <div className="text-base font-semibold text-ink/55">
          Verdict unavailable
        </div>
        <p className="mt-1 text-sm text-ink/55">
          The scan couldn't produce a verdict. Try again with a different image.
        </p>
      </div>
    );
  }

  const label = verdict.label;
  const pct = Math.max(0, Math.min(100, verdict.aiLikelihood));

  return (
    <section
      aria-labelledby="verdict-headline"
      className={`rounded-[13px] px-[19px] py-[17px] ${FILL[label]} ${INK[label]}`}
    >
      <div className="mb-[9px] flex items-center gap-2">
        <span
          aria-hidden
          className={`h-[9px] w-[9px] rounded-full ${DOT[label]}`}
        />
        <p className="text-[11px] font-medium tracking-[0.3px]">
          {EYEBROW[label]}
        </p>
      </div>
      <h2
        id="verdict-headline"
        className="mb-1 text-[22px] font-medium leading-[1.2]"
      >
        {verdict.headline}
      </h2>
      <p className="mb-[14px] text-[13px] opacity-80">{SUB[label]}</p>
      <div className="mb-[7px] flex items-baseline justify-between">
        <p className="text-[11px] opacity-80">AI likelihood</p>
        <p className="text-[13px] font-medium tabular-nums">
          {formatPercent(verdict.aiLikelihood, 1)}
        </p>
      </div>
      <div
        className={`h-[5px] overflow-hidden rounded-[3px] ${BAR_TRACK[label]}`}
      >
        <div
          className={`h-full ${BAR_FILL[label]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </section>
  );
}
