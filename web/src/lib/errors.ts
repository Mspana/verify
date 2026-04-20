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
  // Client-side validation: user chose a bad file. Inline banner with
  // a Try again / Cancel pair per the upload-rejected mockup.
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

  // Upload / submit / scan lifecycle failures — full-page red with
  // Retry + Go back.
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
    headline: "Your upload expired",
    body: "We couldn't confirm the upload in time. Please try again.",
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
  SCAN_FAILED: {
    surface: "full-page",
    headline: "Scan couldn't finish",
    body: "Something went wrong with the analysis.",
    primary: "retry",
    secondary: "scan-another",
  },
  SCAN_TIMEOUT: {
    // Client-synthesized after 2 min of non-terminal polling —
    // the Worker never emits this code.
    surface: "full-page",
    headline: "Scan couldn't finish",
    body: "The scan took longer than expected.",
    primary: "retry",
    secondary: "scan-another",
  },

  // Product limit, not a failure. Amber, no Retry.
  QUOTA_EXCEEDED: {
    surface: "quota-screen",
    headline: "Daily scan limit reached",
    body: "You've used all your scans for today.",
    secondary: "see-history",
  },

  // Shareable scan URL visited by a stranger, or a purged trash scan.
  // Full-page (not toast-redirect — hiding information with an
  // auto-navigate is worse UX).
  SCAN_NOT_FOUND: {
    surface: "full-page",
    headline: "Scan not found",
    body: "This scan doesn't exist or has been permanently deleted.",
    primary: "go-home",
  },

  // Soft asset failures — handled inline inside ResultPage sections.
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

  // Cookie verify failed — Worker silently reissues; frontend never sees it.
  SESSION_INVALID: {
    surface: "silent",
    headline: "",
    body: "",
  },

  // Site-wide banners.
  UPSTREAM_DOWN: {
    surface: "site-banner",
    headline: "Scanning is temporarily unavailable",
    body: "The detection service is temporarily unavailable. You can still view your history.",
  },
  RATE_LIMITED: {
    // Cloudflare edge or Worker throttle. Amber banner, auto-dismisses
    // 30s after the last 429 event; doesn't block navigation.
    surface: "site-banner",
    headline: "Slow down for a moment",
    body: "Too many requests. Please wait a moment before trying again.",
  },

  // Client sent something the server couldn't parse — client-broken,
  // not user-fixable. Full-page generic with Refresh.
  INVALID_REQUEST: {
    surface: "full-page",
    headline: "Something went wrong",
    body: "Please refresh the page and try again.",
    primary: "refresh",
  },
  INTERNAL_ERROR: {
    surface: "full-page",
    headline: "Something went wrong",
    body: "Please refresh and try again. If this keeps happening, try again later.",
    primary: "refresh",
    secondary: "go-home",
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
): {
  headline: string;
  body: string;
  primary?: ErrorAction;
  secondary?: ErrorAction;
  surface: ErrorSurface;
} {
  const ux = ERROR_UX[code];
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
  return ERROR_UX[code].surface === "full-page";
}

/** Concrete label for each abstract ErrorAction token. */
export const ACTION_LABEL: Record<ErrorAction, string> = {
  retry: "Retry",
  "go-back": "Go back",
  "go-home": "Go to home",
  refresh: "Refresh",
  "scan-another": "Scan another image",
  "see-history": "View history",
};
