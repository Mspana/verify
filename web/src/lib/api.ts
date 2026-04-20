import type {
  ErrorCode,
  QuotaResponse,
  Scan,
  ScanListQuery,
  ScanListResponse,
  SessionResponse,
  SubmitRequest,
  SubmitResponse,
  UploadUrlRequest,
  UploadUrlResponse,
} from "@verify/shared";

import { notifyRateLimit } from "./rateLimit";

// Thin fetch wrapper + typed endpoint functions for the Verify Worker.
// Same-origin in dev (via Vite proxy) and prod (Pages + Workers on one
// domain), so cookies flow without extra config.
//
// Error contract: the Worker sends `{code, message, retryable}` as the
// body of any non-2xx response (see worker/src/types.ts `err()`). We parse
// that shape into a typed ApiError. For responses that don't follow our
// shape — network throw, Cloudflare edge 429, an unexpected 5xx — we
// synthesize a best-fit ErrorCode so callers branch consistently.

/** Response shape for DELETE /api/scan/:id and POST /api/scan/:id/restore.
 *  Local because these one-liners don't warrant shared-package real estate. */
type OkResponse = { ok: true };

/** Response shape for GET /api/health. Local for the same reason. */
export type HealthResponse = {
  status: "ok" | "degraded";
  worker: "ok";
  truthscan: string;
};

type ApiErrorOptions = {
  status?: number;
  retryAfterSeconds?: number;
  isNetwork?: boolean;
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  readonly retryAfterSeconds?: number;
  readonly isNetwork: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    retryable: boolean,
    opts: ApiErrorOptions = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.retryable = retryable;
    this.status = opts.status ?? 0;
    this.retryAfterSeconds = opts.retryAfterSeconds;
    this.isNetwork = opts.isNetwork ?? false;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
  } catch (e) {
    // Network failure (offline, DNS, etc.). Surface as a retryable
    // INTERNAL_ERROR carrying isNetwork so callers (e.g. the upload
    // flow, the polling hook) can show the "You're offline" toast
    // rather than the generic retry page.
    throw new ApiError(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : "Network error",
      true,
      { isNetwork: true },
    );
  }

  if (res.ok) {
    // 204 handler for the rare endpoint that returns nothing.
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  throw await toApiError(res);
}

async function toApiError(res: Response): Promise<ApiError> {
  const retryAfterHeader = res.headers.get("Retry-After");
  const retryAfterSeconds = retryAfterHeader
    ? Number(retryAfterHeader)
    : undefined;
  const opts: ApiErrorOptions = {
    status: res.status,
    retryAfterSeconds: Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds
      : undefined,
  };

  // Try to parse the Worker's standard error shape. Cloudflare edge
  // responses (raw 429, 5xx from a cold start, etc.) may not carry it.
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // fall through to synthesized code
  }

  // 429s fire the rate-limit notifier so AppShell can surface the
  // amber banner — EXCEPT for QUOTA_EXCEEDED, which is also a 429 but
  // semantically a product limit, not a throttle (users see a full-page
  // quota screen instead; the banner would be redundant noise).
  if (res.status === 429) {
    const is429Quota = isWorkerError(body) && body.code === "QUOTA_EXCEEDED";
    if (!is429Quota) notifyRateLimit();
  }

  if (isWorkerError(body)) {
    return new ApiError(body.code, body.message, body.retryable, opts);
  }

  // Synthesize a code from the HTTP status when the body didn't conform.
  if (res.status === 429) {
    return new ApiError(
      "RATE_LIMITED",
      "Too many requests. Please wait a moment and try again.",
      true,
      opts,
    );
  }
  if (res.status >= 500) {
    return new ApiError(
      "INTERNAL_ERROR",
      "Something went wrong. Please try again.",
      true,
      opts,
    );
  }
  return new ApiError(
    "INVALID_REQUEST",
    "The request couldn't be processed.",
    false,
    opts,
  );
}

function isWorkerError(
  b: unknown,
): b is { code: ErrorCode; message: string; retryable: boolean } {
  if (!b || typeof b !== "object") return false;
  const rec = b as Record<string, unknown>;
  return (
    typeof rec.code === "string" &&
    typeof rec.message === "string" &&
    typeof rec.retryable === "boolean"
  );
}

function encodeQuery(q: Record<string, string | number | boolean | undefined>) {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// === Session ===

export function postSession(): Promise<SessionResponse> {
  return req<SessionResponse>("/api/session", { method: "POST" });
}

// === Scan lifecycle ===

export function postUploadUrl(
  body: UploadUrlRequest,
): Promise<UploadUrlResponse> {
  return req<UploadUrlResponse>("/api/scan/upload-url", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function postSubmit(body: SubmitRequest): Promise<SubmitResponse> {
  return req<SubmitResponse>("/api/scan/submit", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getScan(scanId: string): Promise<Scan> {
  return req<Scan>(`/api/scan/${encodeURIComponent(scanId)}`);
}

// === History ===

// Worker uses `deleted`, not `trash`, as the query param — the
// ScanListQuery type in shared/ enforces the right key but it's worth
// noting here so anyone tracing a "where does ?trash=true go" question
// from spec/PR text doesn't end up confused.
export function getScans(q: ScanListQuery = {}): Promise<ScanListResponse> {
  return req<ScanListResponse>(`/api/scans${encodeQuery(q)}`);
}

export function deleteScan(scanId: string): Promise<OkResponse> {
  return req<OkResponse>(`/api/scan/${encodeURIComponent(scanId)}`, {
    method: "DELETE",
  });
}

export function postRestore(scanId: string): Promise<OkResponse> {
  return req<OkResponse>(
    `/api/scan/${encodeURIComponent(scanId)}/restore`,
    { method: "POST" },
  );
}

// === Meta ===

export function getQuota(): Promise<QuotaResponse> {
  return req<QuotaResponse>("/api/quota");
}

export function getHealth(): Promise<HealthResponse> {
  return req<HealthResponse>("/api/health");
}
