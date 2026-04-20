import { useCallback, useRef, type KeyboardEvent, type ReactNode } from "react";

// Two visual modes:
//   "segmented" — pill-style switcher with paper-alt track and paper
//                 active cell. Used by the Heatmap tab on the result
//                 page (per 03-result-detail-ai.html tab-switcher).
//   "underline" — simple underline-on-active text tabs. Reserved for
//                 future use; no current consumer.
//
// Implements the W3C ARIA tab pattern with automatic activation:
//   - role="tablist" with aria-label on the container
//   - role="tab", aria-selected, roving tabindex on each button
//   - Optional aria-controls + id per-tab when the consumer provides
//     panelId / tabId; consumer owns the tabpanel element it labels
//   - ArrowLeft/Right cycle (wrap), Home/End jump. Activation follows
//     focus (automatic) — light-weight, no heavy panel content to
//     preserve across focus changes
//   - Tab (the key) naturally exits the tablist into the tabpanel
//     because only the active tab is tabbable (roving tabindex)

export type TabItem<T extends string> = {
  id: T;
  label: ReactNode;
  /** Button DOM id; set when consumer renders a tabpanel that wants
   *  to aria-labelledby this tab. Optional — omit if no panel exists. */
  tabId?: string;
  /** ID of the tabpanel this tab controls. Optional for the same
   *  reason. Both tabs may legitimately share one panelId when a
   *  single panel swaps its contents. */
  panelId?: string;
};

type Props<T extends string> = {
  tabs: readonly TabItem<T>[];
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
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = useCallback(
    (index: number) => {
      const btn = buttonRefs.current[index];
      if (btn) btn.focus();
    },
    [],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (tabs.length === 0) return;
      const currentIdx = tabs.findIndex((t) => t.id === active);
      if (currentIdx < 0) return;
      let nextIdx: number | null = null;
      switch (e.key) {
        case "ArrowRight":
          nextIdx = (currentIdx + 1) % tabs.length;
          break;
        case "ArrowLeft":
          nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
          break;
        case "Home":
          nextIdx = 0;
          break;
        case "End":
          nextIdx = tabs.length - 1;
          break;
        default:
          return;
      }
      if (nextIdx === null || nextIdx === currentIdx) return;
      e.preventDefault();
      onChange(tabs[nextIdx]!.id);
      // Focus move happens after state flush — the newly-active tab
      // becomes tabindex=0, the old one -1, then we move focus.
      // queueMicrotask is enough since onChange's setState schedules
      // a render within the same task.
      queueMicrotask(() => focusTab(nextIdx!));
    },
    [tabs, active, onChange, focusTab],
  );

  const containerCls =
    variant === "underline"
      ? "flex border-b border-border"
      : "flex rounded-btn bg-paper-alt p-[3px]";

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={containerCls}
    >
      {tabs.map((t, i) => {
        const isActive = t.id === active;
        const buttonCls =
          variant === "underline"
            ? [
                "relative -mb-px px-3 py-2 text-sm transition-colors",
                isActive
                  ? "text-ink border-b-2 border-ink font-medium"
                  : "text-ink/55 hover:text-ink border-b-2 border-transparent",
              ].join(" ")
            : [
                "flex-1 rounded-[6px] py-[7px] text-center text-[12px] transition-colors",
                isActive
                  ? "bg-paper font-medium text-ink"
                  : "text-ink/55 hover:text-ink",
              ].join(" ");
        return (
          <button
            key={t.id}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            role="tab"
            id={t.tabId}
            aria-selected={isActive}
            aria-controls={t.panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={buttonCls}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
