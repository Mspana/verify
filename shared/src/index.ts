// Shared types for the Verify app — the contract between the Cloudflare
// Worker API and the React frontend. This file is the single source of truth
// for the normalized response shape; both packages import from here so a
// change fires TypeScript errors on both sides simultaneously.

// === Top-level state ===

/**
 * Server-emitted state for a scan, returned on the top-level `state` field
 * of every Scan response. Redundant with the section statuses (derivable
 * from them) but computed server-side so the frontend has one value to
 * branch on.
 *
 * - `polling`: scan submitted, no verdict yet
 * - `partial`: core verdict ready; heatmap and/or analysis still pending
 * - `complete`: verdict ready AND heatmap AND analysis have each reached a
 *   terminal state (ready, failed, or skipped — asset failures are soft)
 * - `error`: the scan itself failed (upload, submit, or TruthScan returned
 *   status "failed"). Asset failures do NOT trigger this.
 *
 * Frontend-only pre-scan states (idle, requesting_upload, uploading,
 * submitting) are deliberately NOT modeled here — they live in web/ client
 * code, since they never cross the Worker boundary.
 */
export type ScanState = "polling" | "partial" | "complete" | "error";

// === Verdict ===

/**
 * Our verdict taxonomy, normalized from TruthScan's free-form strings so
 * the frontend is insulated from upstream changes. The Worker's
 * normalize.ts owns the mapping.
 */
export type VerdictLabel = "human" | "ai" | "uncertain";

/**
 * Core verdict for a scan. Discriminated on `status`: only `ready` carries
 * populated fields, so TypeScript forces call sites to narrow before
 * accessing `label`, `headline`, etc.
 *
 * `label` drives UI branching; `headline` is the display string and is
 * separately localizable without touching logic.
 *
 * There is no `skipped` state for verdict — the scan either produces one
 * or fails entirely.
 */
export type Verdict =
  | { status: "pending" }
  | {
      status: "ready";
      label: VerdictLabel;
      headline: string;
      aiLikelihood: number;
      confidence: number;
    }
  | { status: "failed" };

// === Preview ===

/**
 * Preview image for the scan. `url` is always our proxy path
 * (`/api/scan/:id/preview`) — TruthScan URLs never cross this boundary.
 */
export type Preview =
  | { status: "pending" }
  | { status: "ready"; url: string }
  | { status: "failed" };

// === Heatmap ===

/**
 * How the heatmap PNG should be rendered. `transparent` is a PNG with only
 * the heat regions opaque, meant to be composited over the original with a
 * client-side opacity slider. `overlayed` is a pre-composited PNG. MVP
 * always requests `transparent`; the union exists so future work can add
 * `overlayed` without a type change.
 */
export type HeatmapMode = "transparent" | "overlayed";

/**
 * Heatmap asset. Soft-failable: `failed` or `skipped` render as an inline
 * "Heatmap unavailable" tile, not a full-page error. `url` is always our
 * proxy path (`/api/scan/:id/heatmap`).
 */
export type Heatmap =
  | { status: "pending" }
  | { status: "ready"; url: string; mode: HeatmapMode }
  | { status: "failed" }
  | { status: "skipped" };

// === Analysis ===

/**
 * Strength of agreement between TruthScan's detection signals. Per
 * TruthScan's API docs, one of exactly these four values. Drives the
 * agreement-bar UI; `disagreement` is the case where signals conflict, and
 * pairs with `KeyIndicatorSupport = "opposite"` indicators to render the
 * red-accent "disagrees with verdict" variant.
 */
export type AgreementStrength =
  | "strong"
  | "moderate"
  | "weak"
  | "disagreement";

/**
 * Whether a key indicator argues for the verdict, against it, or is
 * neutral. Drives the left-border accent color on each indicator row:
 * verdict=green, opposite=red, neutral=amber.
 */
export type KeyIndicatorSupport = "verdict" | "opposite" | "neutral";

/**
 * A single bullet in the analysis's "key indicators" list — something
 * TruthScan observed about the image that informed the verdict.
 */
export type KeyIndicator = {
  label: string;
  supports: KeyIndicatorSupport;
};

/**
 * Deep analysis payload. Soft-failable; when `failed` or `skipped` the UI
 * shows a muted "Detailed analysis unavailable" note while the verdict
 * banner stays intact. The core verdict is the product; analysis is the
 * bonus.
 */
export type Analysis =
  | { status: "pending" }
  | {
      status: "ready";
      agreement: AgreementStrength;
      imageTags: string[];
      keyIndicators: KeyIndicator[];
      reasoning: string;
      recommendations: string[];
    }
  | { status: "failed" }
  | { status: "skipped" };

// === Signals ===

/**
 * Side-channel observations about the image, drawn from TruthScan's
 * `metadata` and `warnings` on the first poll. Part of the core stream —
 * available as soon as the verdict is ready.
 *
 * `watermark` is an object (not a plain string) so the UI can render both
 * the provider label and the detection confidence, e.g. "Gemini watermark
 * (95% confidence)", rather than dropping the confidence from the raw
 * warning.
 */
export type Signals = {
  hasExif: boolean;
  screenRecapture: boolean;
  watermark: { label: string; confidence: number } | null;
};

// === Errors ===

/**
 * Stable error code enum — the contract the frontend branches on. Adding
 * codes is safe; renaming or repurposing is not. Mirrors the table in
 * ERRORS.md section "Error code enum".
 */
export type ErrorCode =
  | "FILE_TOO_LARGE"
  | "FILE_TOO_SMALL"
  | "UNSUPPORTED_TYPE"
  | "FILENAME_INVALID"
  | "UPLOAD_FAILED"
  | "UPLOAD_EXPIRED"
  | "SUBMIT_FAILED"
  | "QUOTA_EXCEEDED"
  | "SCAN_NOT_FOUND"
  | "SCAN_FAILED"
  | "SCAN_TIMEOUT"
  | "HEATMAP_UNAVAILABLE"
  | "ANALYSIS_UNAVAILABLE"
  | "PREVIEW_UNAVAILABLE"
  | "SESSION_INVALID"
  | "UPSTREAM_DOWN"
  | "RATE_LIMITED"
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR";

/**
 * Error payload on Scan's top-level `error` field. Populated only when
 * `state` is "error"; `null` otherwise. `message` is user-facing copy;
 * `retryable` drives the Retry-vs-Go-back button choice.
 *
 * Soft asset failures (HEATMAP_UNAVAILABLE, ANALYSIS_UNAVAILABLE,
 * PREVIEW_UNAVAILABLE) do NOT populate this field — they surface inline
 * on the relevant section's own status and the scan stays `complete`.
 */
export type ScanError = {
  code: ErrorCode;
  message: string;
  retryable: boolean;
};

// === Scan response ===

/**
 * The full normalized scan response. Returned by `GET /api/scan/:id` and
 * as the items of the `GET /api/scans` list. Every cross-boundary scan
 * representation uses this shape; the Worker's normalize.ts (Phase 2)
 * owns the translation from TruthScan's raw shape.
 */
export type Scan = {
  id: string;
  state: ScanState;
  /** ISO 8601 UTC timestamp. */
  createdAt: string;
  filename: string;
  verdict: Verdict;
  preview: Preview;
  heatmap: Heatmap;
  analysis: Analysis;
  signals: Signals;
  /** Populated only when `state` is "error"; `null` otherwise. */
  error: ScanError | null;
};

// === Requests ===

/**
 * Body for `POST /api/scan/upload-url`. The Worker generates the scanId
 * and reads userId from the signed cookie, so the client has nothing
 * unique to contribute beyond file metadata.
 *
 * `fileType` is a plain string (not a union of allowed MIMEs) because
 * allowlist validation lives in the Worker — the type system shouldn't
 * lag when we add support for new formats.
 */
export type UploadUrlRequest = {
  filename: string;
  fileSize: number;
  fileType: string;
};

/**
 * Response for `POST /api/scan/upload-url`. The browser PUTs the file
 * bytes to `uploadUrl` (a Spaces presigned URL, direct-to-bucket), then
 * calls submit with `scanId` and `filePath`.
 */
export type UploadUrlResponse = {
  uploadUrl: string;
  filePath: string;
  scanId: string;
};

/** Body for `POST /api/scan/submit`. */
export type SubmitRequest = {
  scanId: string;
  filePath: string;
};

/**
 * Response for `POST /api/scan/submit`. `state` is narrowed to the literal
 * `"polling"` since submit always transitions into the polling loop on
 * success; any other state would be a protocol bug.
 */
export type SubmitResponse = {
  scanId: string;
  state: "polling";
};

/**
 * Response for `POST /api/session`. The `Set-Cookie` header is the
 * mechanism of record (HttpOnly, HMAC-signed); returning `userId` in the
 * body lets the frontend know its identity without parsing the cookie
 * (which it can't — HttpOnly blocks JS access).
 */
export type SessionResponse = {
  userId: string;
};

/**
 * Response for `GET /api/quota`. `resetsAt` is an ISO 8601 timestamp —
 * midnight Beijing time for MVP.
 */
export type QuotaResponse = {
  used: number;
  limit: number;
  resetsAt: string;
};

/**
 * Query params for `GET /api/scans`. Serialized to a URL query string at
 * the call site; this type is for client-code ergonomics, not the wire
 * format. `deleted: true` returns the trash view instead of active scans.
 */
export type ScanListQuery = {
  limit?: number;
  cursor?: string;
  deleted?: boolean;
};

/**
 * Paginated response for `GET /api/scans`. `nextCursor` is absent on the
 * final page; its presence means "there is more, pass this back as
 * `cursor` to continue."
 */
export type ScanListResponse = {
  scans: Scan[];
  nextCursor?: string;
};
