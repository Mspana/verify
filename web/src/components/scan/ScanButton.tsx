import { Loader2, Scan as ScanIcon } from "lucide-react";

// Primary bilingual CTA. "扫描 · Scan" stays bilingual in both locales
// — treated like the brand, part of the visual system. Mobile: full-
// width with the corner-bracket Scan icon left of the label. Desktop:
// no icon, stretches to fill the upload-row grid cell.
//
// Three "can't click" states, each with different semantics:
//   - disabled (no file selected / loading): HTML `disabled`.
//   - unavailable (UPSTREAM_DOWN): aria-disabled="true" — stays in tab
//     order and focusable so screen readers can read the tooltip.

type Props = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  unavailable?: boolean;
  unavailableReason?: string;
};

export function ScanButton({
  onClick,
  disabled,
  loading,
  unavailable,
  unavailableReason,
}: Props) {
  const isHardDisabled = disabled || loading;
  const reasonId = "scan-button-unavailable-reason";

  return (
    <>
      {unavailable && unavailableReason && (
        <span id={reasonId} className="sr-only">
          {unavailableReason}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          if (unavailable) {
            e.preventDefault();
            return;
          }
          onClick();
        }}
        disabled={isHardDisabled}
        aria-disabled={unavailable || undefined}
        aria-describedby={unavailable ? reasonId : undefined}
        title={unavailable ? unavailableReason : undefined}
        className={[
          "flex h-full w-full items-center justify-center gap-2",
          "rounded-card bg-cobalt text-paper text-[14px] font-medium tracking-[0.2px]",
          "py-3.5 px-4 transition-colors hover:bg-cobalt/90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          unavailable ? "opacity-50 cursor-not-allowed hover:bg-cobalt" : "",
        ].join(" ")}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin md:hidden" aria-hidden />
        ) : (
          <ScanIcon
            className="h-3.5 w-3.5 md:hidden"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
        <span>扫描 · Scan</span>
      </button>
    </>
  );
}
