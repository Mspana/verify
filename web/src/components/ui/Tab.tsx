import type { ReactNode } from "react";

// Simple text tabs with an underline on the active item. Keyboard nav
// is handled by the native button tab order; arrow-key navigation is
// post-MVP.

type Tab<T extends string> = {
  id: T;
  label: ReactNode;
};

type Props<T extends string> = {
  tabs: readonly Tab<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
};

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: Props<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex border-b border-paper-edge"
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
                : "text-ink-muted hover:text-ink border-b-2 border-transparent",
            ].join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
