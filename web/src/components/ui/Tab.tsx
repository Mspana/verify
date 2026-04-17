import type { ReactNode } from "react";

// Two visual modes:
//   "segmented" — pill-style switcher with paper-alt track and paper
//                 active cell. Used by the Heatmap tab on the result
//                 page (per 03-result-detail-ai.html tab-switcher).
//   "underline" — simple underline-on-active text tabs. Reserved for
//                 future use; no current consumer.

type Tab<T extends string> = {
  id: T;
  label: ReactNode;
};

type Props<T extends string> = {
  tabs: readonly Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  variant?: "segmented" | "underline";
};

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  variant = "segmented",
}: Props<T>) {
  if (variant === "underline") {
    return (
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex border-b border-border"
      >
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={[
                "relative -mb-px px-3 py-2 text-sm transition-colors",
                isActive
                  ? "text-ink border-b-2 border-ink font-medium"
                  : "text-ink/55 hover:text-ink border-b-2 border-transparent",
              ].join(" ")}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex rounded-btn bg-paper-alt p-[3px]"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={[
              "flex-1 rounded-[6px] py-[7px] text-center text-[12px] transition-colors",
              isActive
                ? "bg-paper font-medium text-ink"
                : "text-ink/55 hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
