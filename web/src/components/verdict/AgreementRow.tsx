import type { AgreementStrength } from "@verify/shared";

// Agreement strength row, per 03-result-detail-ai.html .agreement-row
// and the .warn variant in 05-pending-and-disagreement.html.
// White card; 4 bar pips on the right; label + value stacked on the left.
// Disagreement uses an uncertain-accent border + uncertain-ink value.

const COPY: Record<AgreementStrength, string> = {
  strong: "Strong",
  moderate: "Moderate",
  weak: "Weak",
  disagreement: "Disagreement",
};

const BARS_FILLED: Record<AgreementStrength, number> = {
  strong: 3,
  moderate: 2,
  weak: 1,
  disagreement: 1,
};

type Props = {
  agreement: AgreementStrength;
};

export function AgreementRow({ agreement }: Props) {
  const isDisagreement = agreement === "disagreement";
  const filled = BARS_FILLED[agreement];
  const fillColor = isDisagreement ? "bg-uncertain-accent" : "bg-ai-accent";
  return (
    <div
      className={[
        "flex items-center justify-between rounded-[10px] border bg-white px-[14px] py-[11px]",
        isDisagreement ? "border-uncertain-accent" : "border-border",
      ].join(" ")}
    >
      <div className="min-w-0">
        <p className="mb-0.5 text-[11px] tracking-[0.2px] text-ink/55 uppercase">
          Detector agreement
        </p>
        <p
          className={[
            "text-[13px] font-medium",
            isDisagreement ? "text-uncertain-ink" : "text-ink",
          ].join(" ")}
        >
          {COPY[agreement]}
        </p>
      </div>
      <div aria-hidden className="flex gap-[3px]">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={`h-[14px] w-[6px] rounded-[2px] ${
              i < filled ? fillColor : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
