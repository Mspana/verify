import { Check, X } from "lucide-react";
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
// That means a human verdict with a disagreeing indicator renders with
// a green (ai-accent) rail, making the conflict immediately scannable.
//
// In disagreement mode the rows also get a label head (check/X icon +
// "Suggests AI" or "Suggests real"). In non-disagreement mode we just
// render the indicator text — the rail color carries the agreement
// semantic on its own.

// Explicit class literals so Tailwind JIT can see them all.
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

// Head label only shown in disagreement mode.
function headFor(
  verdict: VerdictLabel | null,
  support: KeyIndicatorSupport,
): { label: string; cls: string; icon: "check" | "x" | "dash" } | null {
  if (!verdict) return null;
  if (support === "neutral") {
    return { label: "Neutral signal", cls: "text-uncertain-ink", icon: "dash" };
  }
  const agrees = support === "verdict";
  // "Suggests AI" / "Suggests real" is keyed off the DIRECTION the
  // indicator points, which depends on both support and verdict.
  //   verdict=ai,  agrees        → points to AI     → "Suggests AI"
  //   verdict=ai,  disagrees     → points to human  → "Suggests real"
  //   verdict=hum, agrees        → points to human  → "Suggests real"
  //   verdict=hum, disagrees     → points to AI     → "Suggests AI"
  //   verdict=unc, either        → "Mixed signal"   (no clean direction)
  if (verdict === "uncertain") {
    return { label: "Mixed signal", cls: "text-uncertain-ink", icon: "dash" };
  }
  const pointsToAi =
    (verdict === "ai" && agrees) || (verdict === "human" && !agrees);
  return pointsToAi
    ? { label: "Suggests AI", cls: "text-ai-ink", icon: "check" }
    : { label: "Suggests real", cls: "text-human-ink", icon: "x" };
}

type Props = {
  items: KeyIndicator[];
  /** The scan's verdict label, for verdict-aware rail coloring.
   *  Null when the verdict isn't ready yet (indicators won't render
   *  in that case anyway, but guard for completeness). */
  verdict: VerdictLabel | null;
  /** True when scan.analysis.agreement === "disagreement". Enables the
   *  row-head (check/x + "Suggests AI/real") variant. */
  showHead?: boolean;
};

export function KeyIndicators({ items, verdict, showHead }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink/55">
        No specific indicators highlighted for this image.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((ind, i) => {
        const rail = railFor(verdict, ind.supports);
        const head = showHead ? headFor(verdict, ind.supports) : null;
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
