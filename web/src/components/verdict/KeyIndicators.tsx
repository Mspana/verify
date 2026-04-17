import type { KeyIndicator, KeyIndicatorSupport } from "@verify/shared";

// Per shared/src/index.ts the left-border accent color is semantic,
// not verdict-colored: verdict=green, opposite=red, neutral=amber.
// This axis ("agrees with the verdict") is orthogonal to the verdict
// itself, so a disagreement variant mixes red and green rows under
// whichever verdict color is in play.

const ACCENT: Record<KeyIndicatorSupport, string> = {
  verdict: "border-l-ai-accent",
  opposite: "border-l-human-accent",
  neutral: "border-l-uncertain-accent",
};

type Props = {
  items: KeyIndicator[];
};

export function KeyIndicators({ items }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink/55">
        No specific indicators highlighted for this image.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((ind, i) => (
        <li
          key={i}
          className={`rounded-card border border-border border-l-4 bg-paper px-4 py-3 text-sm ${ACCENT[ind.supports]}`}
        >
          {ind.label}
        </li>
      ))}
    </ul>
  );
}
