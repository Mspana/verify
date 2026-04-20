import { useTranslation } from "react-i18next";
import type { Verdict, VerdictLabel } from "@verify/shared";

// Compact status indicator: a small colored dot + inked label.
// Red/green inversion (human=red, ai=green) is intentional — China-
// first product.

const DOT_CLS: Record<VerdictLabel, string> = {
  human: "bg-human-accent",
  ai: "bg-ai-accent",
  uncertain: "bg-uncertain-accent",
};

const LABEL_CLS: Record<VerdictLabel, string> = {
  human: "text-human-ink",
  ai: "text-ai-ink",
  uncertain: "text-uncertain-ink",
};

const LABEL_KEY: Record<VerdictLabel, string> = {
  human: "verdict.label.human",
  ai: "verdict.label.ai",
  uncertain: "verdict.label.uncertain",
};

type Props = {
  verdict: Verdict;
  /** Font size preset. `sm` matches history rows; `md` is slightly larger. */
  size?: "sm" | "md";
  className?: string;
};

const SIZE: Record<"sm" | "md", { text: string; dot: string }> = {
  sm: { text: "text-xs", dot: "h-[7px] w-[7px]" },
  md: { text: "text-sm", dot: "h-[9px] w-[9px]" },
};

export function VerdictStatus({ verdict, size = "sm", className = "" }: Props) {
  const s = SIZE[size];
  const { t } = useTranslation();

  if (verdict.status === "pending") {
    return (
      <div className={`flex items-center gap-1.5 ${s.text} ${className}`}>
        <span className={`${s.dot} rounded-full bg-ink/20`} aria-hidden />
        <span className="text-ink/55">{t("verdict.status.scanning")}</span>
      </div>
    );
  }
  if (verdict.status === "failed") {
    return (
      <div className={`flex items-center gap-1.5 ${s.text} ${className}`}>
        <span className={`${s.dot} rounded-full bg-ink/20`} aria-hidden />
        <span className="text-ink/55">{t("verdict.status.failed")}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 ${s.text} ${className}`}>
      <span
        className={`${s.dot} rounded-full ${DOT_CLS[verdict.label]}`}
        aria-hidden
      />
      <span className={`font-medium ${LABEL_CLS[verdict.label]}`}>
        {t(LABEL_KEY[verdict.label])}
      </span>
    </div>
  );
}
