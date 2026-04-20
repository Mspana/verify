import { AlertTriangle, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

// Top-of-app banner for system-level conditions:
//   variant="red"   — UPSTREAM_DOWN: detector offline, user literally
//                     can't scan. Paper-warmed red fill, deep red text.
//   variant="amber" — RATE_LIMITED: "slow down" signal, not a stop.
//                     User can still navigate and view history.
//
// Intentionally no "neutral" or generic variant — banners are
// semantically red or amber, never informational blue in this app.

type Variant = "red" | "amber";

type Props = {
  variant: Variant;
  children: ReactNode;
  onDismiss?: () => void;
};

const STYLES: Record<Variant, { bg: string; text: string; border: string }> = {
  red: {
    bg: "bg-human-fill",
    text: "text-human-ink",
    border: "border-human-accent/30",
  },
  amber: {
    bg: "bg-uncertain-fill",
    text: "text-uncertain-ink",
    border: "border-uncertain-accent/30",
  },
};

export function SiteBanner({ variant, children, onDismiss }: Props) {
  const s = STYLES[variant];
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "flex items-center gap-2 border-b px-4 py-2 text-[12px] md:text-[13px]",
        s.bg,
        s.text,
        s.border,
      ].join(" ")}
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("common.dismiss")}
          className="-my-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded opacity-70 hover:opacity-100"
        >
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </button>
      )}
    </div>
  );
}
