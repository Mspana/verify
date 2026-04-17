import type { ErrorCode } from "@verify/shared";

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
// supply (headline, actions).

/**
 * Where the error renders.
 *
 * - `inline`: banner above the upload area, scoped to the home screen.
 * - `full-page`: dedicated scan-error page with retry/go-back actions.
 * - `quota-screen`: the dedicated "Daily limit reached" layout.
 * - `site-banner`: top-of-every-page banner; upload area is disabled.
 * - `soft-asset`: muted tile inside a result section (heatmap tab,
 *   analysis area, preview slot) — scan is still `complete`.
 * - `toast-redirect`: silent redirect to home with a transient toast.
 * - `silent`: logged only; never surfaced.
 */
export type ErrorSurface =
  | "inline"
  | "full-page"
  | "quota-screen"
  | "site-banner"
  | "soft-asset"
  | "toast-redirect"
  | "silent";

export type ErrorAction = "retry" | "go-back" | "scan-another" | "see-history";

export type ErrorUx = {
  surface: ErrorSurface;
  /** Default headline; server message is shown below (or replaces body). */
  headline: string;
  /** Default body copy when no server message is available. */
  body: string;
  primary?: ErrorAction;
  secondary?: ErrorAction;
};

export const ERROR_UX: Record<ErrorCode, ErrorUx> = {
  FILE_TOO_LARGE: {
    surface: "inline",
    headline: "File too large",
    body: "Maximum size is 10 MB. Try a smaller file or convert to JPG.",
  },
  FILE_TOO_SMALL: {
    surface: "inline",
    headline: "File too small",
    body: "This image is too small to analyze.",
  },
  UNSUPPORTED_TYPE: {
    surface: "inline",
    headline: "Unsupported file type",
    body: "Try JPG, PNG, or HEIC.",
  },
  FILENAME_INVALID: {
    surface: "inline",
    headline: "Filename not accepted",
    body: "Rename the file and try again.",
  },
  UPLOAD_FAILED: {
    surface: "full-page",
    headline: "Upload couldn't finish",
    body: "Your connection may have dropped. Your image wasn't saved.",
    primary: "retry",
    secondary: "go-back",
  },
  UPLOAD_EXPIRED: {
    // The upload helper retries once with a fresh URL before surfacing.
    // If we reach this entry, that retry also failed.
    surface: "full-page",
    headline: "Upload couldn't finish",
    body: "We couldn't confirm the upload. Please try again.",
    primary: "retry",
    secondary: "go-back",
  },
  SUBMIT_FAILED: {
    surface: "full-page",
    headline: "We couldn't start the scan",
    body: "The detection service didn't respond. Your image wasn't scanned.",
    primary: "retry",
    secondary: "go-back",
  },
  QUOTA_EXCEEDED: {
    surface: "quota-screen",
    headline: "Daily limit reached",
    body: "You've used all your scans for today. Your limit resets at midnight (Beijing time).",
    secondary: "see-history",
  },
  SCAN_NOT_FOUND: {
    surface: "toast-redirect",
    headline: "That scan isn't available.",
    body: "That scan isn't available.",
  },
  SCAN_FAILED: {
    surface: "full-page",
    headline: "Scan couldn't finish",
    body: "Something went wrong with the analysis.",
    primary: "retry",
    secondary: "scan-another",
  },
  SCAN_TIMEOUT: {
    surface: "full-page",
    headline: "Scan couldn't finish",
    body: "The scan took longer than expected.",
    primary: "retry",
    secondary: "scan-another",
  },
  HEATMAP_UNAVAILABLE: {
    surface: "soft-asset",
    headline: "Heatmap unavailable",
    body: "The verdict is still accurate. The visual breakdown couldn't be generated for this image.",
  },
  ANALYSIS_UNAVAILABLE: {
    surface: "soft-asset",
    headline: "Detailed analysis unavailable",
    body: "Detailed analysis unavailable for this image.",
  },
  PREVIEW_UNAVAILABLE: {
    surface: "soft-asset",
    headline: "Preview unavailable",
    body: "The scan is still available — just without a preview thumbnail.",
  },
  SESSION_INVALID: {
    surface: "silent",
    headline: "",
    body: "",
  },
  UPSTREAM_DOWN: {
    surface: "site-banner",
    headline: "Scanning is temporarily unavailable",
    body: "Scanning is temporarily unavailable. Existing scans can still be viewed.",
  },
  RATE_LIMITED: {
    surface: "full-page",
    headline: "Slow down for a moment",
    body: "Too many requests from your connection. Please wait a minute and try again.",
    primary: "retry",
    secondary: "go-back",
  },
  INVALID_REQUEST: {
    surface: "inline",
    headline: "That didn't work",
    body: "The request couldn't be processed. Try again, or choose a different file.",
  },
  INTERNAL_ERROR: {
    surface: "full-page",
    headline: "Something went wrong",
    body: "Please try again.",
    primary: "retry",
    secondary: "go-back",
  },
};

/**
 * Resolve the user-facing copy for an error, preferring the server's
 * message when one is provided. Returns an object (not a single string)
 * so callers can render headline, body, and actions independently.
 */
export function resolveErrorCopy(
  code: ErrorCode,
  serverMessage?: string,
): { headline: string; body: string; primary?: ErrorAction; secondary?: ErrorAction; surface: ErrorSurface } {
  const ux = ERROR_UX[code];
  return {
    surface: ux.surface,
    headline: ux.headline,
    body: serverMessage ?? ux.body,
    primary: ux.primary,
    secondary: ux.secondary,
  };
}
