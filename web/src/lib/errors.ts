import type { ErrorCode } from "@verify/shared";

import i18n from "../i18n";

// Central ErrorCode → UX mapping. One place that says "this code renders
// how, says what, and offers which actions." Downstream screens (upload
// area, result page, error page, quota page, toast layer) read from here
// rather than duplicating the mapping — when ERRORS.md changes, we touch
// this file and only this file.
//
// Server-supplied messages always take priority over the defaults below —
// the Worker's error `message` is already user-facing copy per
// ERRORS.md's "Errors are for users first" principle. The defaults are
// fallbacks for client-synthesized errors (SCAN_TIMEOUT, HEIC conversion
// failure, network throws) and copy-scoped fields the Worker doesn't
// supply (headline, actions). Defaults are looked up via i18n at call
// time so locale changes re-render naturally.

/**
 * Where the error renders.
 *
 * - `inline`: banner above the upload area, scoped to the home screen.
 *   Used for client-side validation rejects the user can correct
 *   immediately (wrong type, too big, bad name).
 * - `full-page`: dedicated error screen with icon circle, title, body,
 *   action row, error-code footer. Renders in place inside AppShell so
 *   the sidebar and nav remain functional.
 * - `quota-screen`: full-page variant tuned amber for the "daily limit
 *   reached" case — not a failure, a product limit.
 * - `site-banner`: top-of-every-page bar. UPSTREAM_DOWN (red) and
 *   RATE_LIMITED (amber, auto-dismiss).
 * - `soft-asset`: muted tile inside a result section (heatmap tab,
 *   analysis area, preview slot). Scan stays `complete`.
 * - `silent`: logged only; never surfaced (SESSION_INVALID — Worker
 *   auto-reissues, no user-visible effect).
 */
export type ErrorSurface =
  | "inline"
  | "full-page"
  | "quota-screen"
  | "site-banner"
  | "soft-asset"
  | "silent";

/**
 * Abstract action tokens. The concrete label + handler are resolved by
 * the rendering screen, which knows whether "retry" means "re-submit
 * the same file" or "go back to the upload area."
 */
export type ErrorAction =
  | "retry"
  | "go-back"
  | "go-home"
  | "refresh"
  | "scan-another"
  | "see-history";

type ErrorUxConfig = {
  surface: ErrorSurface;
  primary?: ErrorAction;
  secondary?: ErrorAction;
};

const ERROR_UX_CONFIG: Record<ErrorCode, ErrorUxConfig> = {
  FILE_TOO_LARGE: { surface: "inline" },
  FILE_TOO_SMALL: { surface: "inline" },
  UNSUPPORTED_TYPE: { surface: "inline" },
  FILENAME_INVALID: { surface: "inline" },

  UPLOAD_FAILED: { surface: "full-page", primary: "retry", secondary: "go-back" },
  UPLOAD_EXPIRED: { surface: "full-page", primary: "retry", secondary: "go-back" },
  SUBMIT_FAILED: { surface: "full-page", primary: "retry", secondary: "go-back" },
  SCAN_FAILED: { surface: "full-page", primary: "retry", secondary: "scan-another" },
  SCAN_TIMEOUT: { surface: "full-page", primary: "retry", secondary: "scan-another" },

  QUOTA_EXCEEDED: { surface: "quota-screen", secondary: "see-history" },

  SCAN_NOT_FOUND: { surface: "full-page", primary: "go-home" },

  HEATMAP_UNAVAILABLE: { surface: "soft-asset" },
  ANALYSIS_UNAVAILABLE: { surface: "soft-asset" },
  PREVIEW_UNAVAILABLE: { surface: "soft-asset" },

  SESSION_INVALID: { surface: "silent" },

  UPSTREAM_DOWN: { surface: "site-banner" },
  RATE_LIMITED: { surface: "site-banner" },

  INVALID_REQUEST: { surface: "full-page", primary: "refresh" },
  INTERNAL_ERROR: { surface: "full-page", primary: "refresh", secondary: "go-home" },
};

export type ErrorUx = ErrorUxConfig & {
  /** Default headline; server message is shown below (or replaces body). */
  headline: string;
  /** Default body copy when no server message is available. */
  body: string;
};

/**
 * Read the current localized copy for an error code. Re-computed on each
 * access so a language change re-renders naturally (components call this
 * during render). The translate function is imported from the shared i18n
 * instance rather than injected, so this module stays callable outside a
 * React tree (e.g. from the AppShell site-banner read-through).
 */
function uxFor(code: ErrorCode): ErrorUx {
  const cfg = ERROR_UX_CONFIG[code];
  return {
    ...cfg,
    headline: i18n.t(`errors.${code}.headline`),
    body: i18n.t(`errors.${code}.body`),
  };
}

/**
 * Proxy that looks like the old ERROR_UX constant object but resolves
 * each entry against the current language at access time. Keeps the old
 * call-site shape working (`ERROR_UX.RATE_LIMITED.body`) while making
 * the copy reactive to locale changes.
 */
export const ERROR_UX: Record<ErrorCode, ErrorUx> = new Proxy(
  {} as Record<ErrorCode, ErrorUx>,
  {
    get(_target, prop: string) {
      return uxFor(prop as ErrorCode);
    },
  },
);

/**
 * Resolve the user-facing copy for an error, preferring the server's
 * message when one is provided. Returns an object (not a single string)
 * so callers can render headline, body, and actions independently.
 */
export function resolveErrorCopy(
  code: ErrorCode,
  serverMessage?: string,
): {
  headline: string;
  body: string;
  primary?: ErrorAction;
  secondary?: ErrorAction;
  surface: ErrorSurface;
} {
  const ux = uxFor(code);
  return {
    surface: ux.surface,
    headline: ux.headline,
    body: serverMessage ?? ux.body,
    primary: ux.primary,
    secondary: ux.secondary,
  };
}

/**
 * True when the error wants a red full-page ErrorPage (SCAN_FAILED,
 * UPLOAD_FAILED, etc.); false for the amber QUOTA_EXCEEDED variant.
 * Used by consumers that render both through the same screen slot.
 */
export function isRedFullPage(code: ErrorCode): boolean {
  return ERROR_UX_CONFIG[code].surface === "full-page";
}

/**
 * Concrete localized label for an abstract ErrorAction token. Callers
 * use this during render so the label tracks the active language.
 */
export function actionLabel(action: ErrorAction): string {
  return i18n.t(`errorActions.${action}`);
}

/**
 * Proxy-backed map that looks like the old ACTION_LABEL constant while
 * resolving each lookup against the current language. Preserves the old
 * call-site shape (`ACTION_LABEL.retry`) for drop-in compatibility.
 */
export const ACTION_LABEL: Record<ErrorAction, string> = new Proxy(
  {} as Record<ErrorAction, string>,
  {
    get(_target, prop: string) {
      return i18n.t(`errorActions.${prop}`);
    },
  },
);
