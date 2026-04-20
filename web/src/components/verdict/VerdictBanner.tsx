import { useTranslation } from "react-i18next";
import type { Verdict, VerdictLabel } from "@verify/shared";

import { formatPercent } from "../../lib/format";
import { Skeleton } from "../ui/Skeleton";

// The verdict card at the top-right of the result page (or full-width
// on mobile). Bilingual eyebrow (人工 · HUMAN / AI 生成 · AI / 不确定 ·
// UNSURE) is part of the visual identity and stays bilingual regardless
// of locale — matches the brand treatment.

const EYEBROW: Record<VerdictLabel, string> = {
  human: "人工 · HUMAN",
  ai: "AI 生成 · AI",
  uncertain: "不确定 · UNSURE",
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

const SUB_KEY: Record<VerdictLabel, string> = {
  human: "verdict.sub.human",
  ai: "verdict.sub.ai",
  uncertain: "verdict.sub.uncertain",
};

type Props = {
  verdict: Verdict;
};

export function VerdictBanner({ verdict }: Props) {
  const { t } = useTranslation();

  if (verdict.status === "pending") {
    return <Skeleton className="h-[152px] w-full rounded-[13px]" />;
  }
  if (verdict.status === "failed") {
    return (
      <div className="rounded-[13px] border border-border bg-paper p-5">
        <div className="text-base font-semibold text-ink/55">
          {t("verdict.unavailable")}
        </div>
        <p className="mt-1 text-sm text-ink/55">
          {t("verdict.unavailableBody")}
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
      <p className="mb-[14px] text-[13px] opacity-80">{t(SUB_KEY[label])}</p>
      <div className="mb-[7px] flex items-baseline justify-between">
        <p className="text-[11px] opacity-80">{t("verdict.aiLikelihood")}</p>
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
