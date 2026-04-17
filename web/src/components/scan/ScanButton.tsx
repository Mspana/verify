import { Loader2, Scan as ScanIcon } from "lucide-react";

// Primary bilingual CTA. Mobile: full-width with the corner-bracket
// Scan icon left of the label. Desktop: no icon, stretches to fill
// the upload-row grid cell (per 01-home.html upload-row layout).

type Props = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function ScanButton({ onClick, disabled, loading }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={[
        "flex h-full w-full items-center justify-center gap-2",
        "rounded-card bg-cobalt text-paper text-[14px] font-medium tracking-[0.2px]",
        "py-3.5 px-4 transition-colors hover:bg-cobalt/90",
        "disabled:opacity-50 disabled:cursor-not-allowed",
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
  );
}
