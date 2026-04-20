import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

// Single-toast layer for the app. Mount <ToastHost /> once at the root
// (we do that in AppShell). Any descendant calls useToast().show({ ... })
// to pop one. Showing a second toast immediately replaces the first —
// no stacking — which matches the MVP usage (delete-with-undo, restore
// confirmation, the occasional info nudge).
//
// Position: bottom-center on mobile, bottom-right on desktop.
// Style: bg-ink text-paper rounded-card; the optional action sits
// inline as a cobalt text-button.
//
// Auto-dismiss after AUTO_DISMISS_MS unless the user clicks the X or
// invokes the action. Calling show() while a toast is visible cancels
// the in-flight dismiss timer.

const AUTO_DISMISS_MS = 5_000;

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastInput = {
  message: string;
  action?: ToastAction;
};

type ToastState =
  | { kind: "hidden" }
  | { kind: "visible"; id: number; message: string; action?: ToastAction };

type ToastContextValue = {
  show: (toast: ToastInput) => void;
  dismiss: () => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>({ kind: "hidden" });
  const timerRef = useRef<number | null>(null);
  // Bumped on every show() so we can ignore stale auto-dismiss timers
  // when the user pops a new toast before the previous one expires.
  const idRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const dismiss = useCallback(() => {
    clearTimer();
    setState({ kind: "hidden" });
  }, []);

  const show = useCallback((toast: ToastInput) => {
    clearTimer();
    idRef.current += 1;
    const id = idRef.current;
    setState({ kind: "visible", id, message: toast.message, action: toast.action });
    timerRef.current = window.setTimeout(() => {
      // Guard against a newer toast having taken over while this timer
      // was queued. Without the id check, two rapid show()s would have
      // the older timer dismissing the newer toast early.
      setState((prev) =>
        prev.kind === "visible" && prev.id === id ? { kind: "hidden" } : prev,
      );
      timerRef.current = null;
    }, AUTO_DISMISS_MS);
  }, []);

  // Cleanup if the provider itself unmounts.
  useEffect(() => () => clearTimer(), []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      <ToastHost state={state} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useToast must be used inside a <ToastProvider>. Mount it once near the app root.",
    );
  }
  return ctx;
}

function ToastHost({
  state,
  dismiss,
}: {
  state: ToastState;
  dismiss: () => void;
}) {
  const { t } = useTranslation();
  if (state.kind !== "visible") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed z-50",
        // Bottom-center mobile (above the bottom tab bar safe area),
        // bottom-right desktop.
        "bottom-[max(env(safe-area-inset-bottom),84px)] left-1/2 -translate-x-1/2",
        "md:bottom-6 md:right-6 md:left-auto md:translate-x-0",
        "max-w-[calc(100vw-32px)] md:max-w-[420px]",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 rounded-card bg-ink px-4 py-3 text-[13px] text-paper shadow-lg">
        <span className="flex-1">{state.message}</span>
        {state.action && (
          <button
            type="button"
            onClick={() => {
              state.action!.onClick();
              dismiss();
            }}
            className="text-[13px] font-medium text-cobalt hover:underline"
          >
            {state.action.label}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("common.dismiss")}
          className="-mr-1 flex h-6 w-6 items-center justify-center rounded text-paper/70 hover:text-paper"
        >
          <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
