import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  KeyIndicator,
  KeyIndicatorSupport,
  VerdictLabel,
} from "@verify/shared";

// Left-rail accent is verdict-aware per the design brief:
//   supports: "verdict"  → rail matches the main verdict color
//   supports: "opposite" → rail is the opposite verdict color
//   supports: "neutral"  → amber (uncertain-accent)
//
// In disagreement mode the rows also get a label head (check/X icon +
// "Suggests AI" or "Suggests real"). In non-disagreement mode we just
// render the indicator text — the rail color carries the agreement
// semantic on its own.

const RAIL: Record<VerdictLabel, string> = {
  human: "border-l-human-accent",
  ai: "border-l-ai-accent",
  uncertain: "border-l-uncertain-accent",
};
const NEUTRAL_RAIL = "border-l-uncertain-accent";
const FALLBACK_RAIL = "border-l-border";

function oppositeOf(verdict: VerdictLabel): VerdictLabel {
  if (verdict === "human") return "ai";
  if (verdict === "ai") return "human";
  return "uncertain";
}

function railFor(
  verdict: VerdictLabel | null,
  support: KeyIndicatorSupport,
): string {
  if (support === "neutral") return NEUTRAL_RAIL;
  if (!verdict) return FALLBACK_RAIL;
  const target = support === "verdict" ? verdict : oppositeOf(verdict);
  return RAIL[target];
}

type HeadKind = "ai" | "real" | "neutral" | "mixed";

function headKindFor(
  verdict: VerdictLabel | null,
  support: KeyIndicatorSupport,
): HeadKind | null {
  if (!verdict) return null;
  if (support === "neutral") return "neutral";
  if (verdict === "uncertain") return "mixed";
  const agrees = support === "verdict";
  const pointsToAi =
    (verdict === "ai" && agrees) || (verdict === "human" && !agrees);
  return pointsToAi ? "ai" : "real";
}

type Props = {
  items: KeyIndicator[];
  verdict: VerdictLabel | null;
  showHead?: boolean;
};

export function KeyIndicators({ items, verdict, showHead }: Props) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <p className="text-sm text-ink/55">{t("result.noIndicators")}</p>
    );
  }

  const headFor = (kind: HeadKind): { label: string; cls: string; icon: "check" | "x" | "dash" } => {
    switch (kind) {
      case "ai":
        return {
          label: t("verdict.indicatorHead.suggestsAi"),
          cls: "text-ai-ink",
          icon: "check",
        };
      case "real":
        return {
          label: t("verdict.indicatorHead.suggestsReal"),
          cls: "text-human-ink",
          icon: "x",
        };
      case "neutral":
        return {
          label: t("verdict.indicatorHead.neutral"),
          cls: "text-uncertain-ink",
          icon: "dash",
        };
      case "mixed":
        return {
          label: t("verdict.indicatorHead.mixed"),
          cls: "text-uncertain-ink",
          icon: "dash",
        };
    }
  };

  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((ind, i) => {
        const rail = railFor(verdict, ind.supports);
        const kind = showHead ? headKindFor(verdict, ind.supports) : null;
        const head = kind ? headFor(kind) : null;
        return (
          <li
            key={i}
            className={`rounded-r-btn border border-border border-l-[3px] bg-white px-[13px] py-[10px] ${rail}`}
          >
            {head && (
              <div className={`mb-0.5 flex items-center gap-1.5 ${head.cls}`}>
                {head.icon === "check" && (
                  <Check className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                )}
                {head.icon === "x" && (
                  <X className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                )}
                {head.icon === "dash" && (
                  <span
                    aria-hidden
                    className="h-[2px] w-2 rounded-full bg-current"
                  />
                )}
                <p className="text-[11px] font-medium">{head.label}</p>
              </div>
            )}
            <p className={`text-[12px] ${head ? "ml-[17px]" : ""}`}>
              {ind.label}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
