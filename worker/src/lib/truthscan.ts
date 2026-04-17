// TruthScan API client — one function per endpoint we call. The API key is
// injected via constructor; the client never reads secrets itself, so it's
// trivially testable and can't accidentally leak into logs.
//
// Zod validates upstream responses at the boundary (approved for TruthScan
// specifically, not elsewhere). Validation keeps the normalizer honest:
// if TruthScan breaks its contract we get a clean error here rather than a
// `TypeError: Cannot read property of undefined` three layers deeper.
//
// Auto-retry: /detect retries ONCE on timeout or 5xx, per ERRORS.md. 4xx
// isn't retried — those are semantic failures that won't recover. This is
// the ONLY endpoint that retries; others surface failure to the caller.

import { z } from "zod";
import type { Logger } from "./logger.ts";

// === Zod schemas ===
//
// Only the fields we read. TruthScan can add fields freely without breaking
// us because Zod objects are permissive by default.

const warningSchema = z.object({
  type: z.string(),
  label: z.string().optional(),
  confidence: z.number().optional(),
  metrics: z.record(z.unknown()).optional(),
});

const analysisResultsSchema = z.object({
  imageTags: z.array(z.string()).optional(),
  agreement: z.string().optional(),
  confidence: z.number().optional(),
  keyIndicators: z.array(z.string()).optional(),
  detailedReasoning: z.string().optional(),
  visualPatterns: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
});

const resultDetailsSchema = z.object({
  is_valid: z.boolean().nullable().optional(),
  detection_step: z.number().optional(),
  final_result: z.string().optional(),
  confidence: z.number().optional(),
  metadata: z.array(z.unknown()).nullable().optional(),
  // Documented by TruthScan in places as the string "null"; using unknown
  // keeps that tolerated along with actual null, strings, and objects.
  metadata_basic_source: z.unknown().optional(),
  // Documented as [label, score] but production returns null when OCR
  // wasn't run. We don't read this — unknown keeps parsing permissive
  // regardless of shape drift.
  ocr: z.unknown().optional(),
  ml_model: z.array(z.unknown()).nullable().optional(),
  // Production returns null when TruthScan skipped heatmap generation
  // (clearly-human images). normalize maps null to `skipped`.
  heatmap_status: z
    .enum(["pending", "ready", "failed"])
    .nullable()
    .optional(),
  heatmap_url: z.string().nullable().optional(),
  analysis_results_status: z
    .enum(["pending", "ready", "skipped", "failed", "analyzing"])
    .nullable()
    .optional(),
  analysis_results: analysisResultsSchema.nullable().optional(),
  // Present on some responses; never read by normalize but listing it
  // explicitly documents intent.
  error_message: z.string().nullable().optional(),
  warnings: z.array(warningSchema).nullable().optional(),
});

export const presignedUrlResponseSchema = z.object({
  status: z.string().optional(),
  presigned_url: z.string(),
  file_path: z.string(),
  document_id: z.string().optional(),
});

export const detectResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
});

export const queryResponseSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "analyzing", "done", "failed"]),
  result: z.number().nullable().optional(),
  result_details: resultDetailsSchema.optional(),
  preview_url: z.string().nullable().optional(),
});

export const healthResponseSchema = z.object({
  status: z.string(),
});

// === Inferred types for consumers ===

export type PresignedUrlResponse = z.infer<typeof presignedUrlResponseSchema>;
export type DetectResponse = z.infer<typeof detectResponseSchema>;
export type QueryResponse = z.infer<typeof queryResponseSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type TruthscanWarning = z.infer<typeof warningSchema>;

// === Result wrapper ===
//
// All client methods return { ok, value } or { ok, error }. Throwing across
// module boundaries is reserved for truly unrecoverable cases; normal
// failure paths (timeouts, 5xx, schema mismatch) are return values so the
// caller has to acknowledge them.

export type TruthscanOk<T> = { ok: true; value: T; durationMs: number };
export type TruthscanErr = {
  ok: false;
  kind: "timeout" | "network" | "upstream" | "schema";
  upstreamStatus?: number;
  message: string;
  durationMs: number;
};

export type TruthscanResult<T> = TruthscanOk<T> | TruthscanErr;

// === Detect flags ===
//
// Hardcoded per ARCHITECTURE.md: transparent heatmap, analysis on, preview
// on. We deliberately do NOT pass an `id` — TruthScan auto-assigns one at
// /get-presigned-url and rejects /detect calls whose `id` it has already
// issued. The returned response.id becomes `truthscanId` on our record.

export type DetectFlags = {
  filePath: string;
};

// Spaces storage host that TruthScan's /get-presigned-url uploads land on.
// The `file_path` from that response is a key relative to this host; /detect
// wants the full URL. Hardcoded for MVP — if staging ever needs a different
// bucket we promote this to an env var read from c.env at handler time.
const TRUTHSCAN_STORAGE_BASE =
  "https://ai-image-detector-prod.nyc3.digitaloceanspaces.com";

const DETECT_TIMEOUT_MS = 15_000;
const DEFAULT_TIMEOUT_MS = 20_000;
const DETECT_RETRY_BACKOFF_MS = 1_000;

export class TruthscanClient {
  // Exported as a public field so the asset handler can compare URL hosts
  // against it to decide between direct-GET and API-POST paths.
  readonly apiBase: string;
  readonly storageHostHint: string;

  constructor(
    private readonly apiKey: string,
    opts?: { apiBase?: string; storageHostHint?: string },
  ) {
    // Per the TruthScan docs, detection calls go to detect-image.truthscan.com.
    this.apiBase = opts?.apiBase ?? "https://detect-image.truthscan.com";
    // Used only to recognize whether a returned asset URL lives on the API
    // host (requires POST + key) vs direct storage (straight GET).
    this.storageHostHint =
      opts?.storageHostHint ?? "detect-image.truthscan.com";
  }

  async getPresignedUrl(
    log: Logger,
    filename: string,
  ): Promise<TruthscanResult<PresignedUrlResponse>> {
    const url = new URL("/get-presigned-url", this.apiBase);
    url.searchParams.set("file_name", filename);
    return this.callJson(
      log,
      "/get-presigned-url",
      {
        method: "GET",
        url: url.toString(),
        headers: { apikey: this.apiKey },
      },
      presignedUrlResponseSchema,
      DEFAULT_TIMEOUT_MS,
    );
  }

  /**
   * POST /detect. Retries ONCE on timeout or 5xx with 1s backoff, as
   * specified in ERRORS.md. 4xx is not retried — those are semantic.
   * Duplicate-billing risk on the retry is accepted for MVP; see ERRORS.md.
   *
   * The caller is responsible for passing a logger already scoped with our
   * scanId so the `scanId` field on log lines stays unambiguously ours.
   */
  async detect(
    log: Logger,
    flags: DetectFlags,
  ): Promise<TruthscanResult<DetectResponse>> {
    // TruthScan wants an absolute URL for the image, not the relative
    // file_path from /get-presigned-url. Strip any leading slash so the
    // join is always exactly one slash.
    const cleanPath = flags.filePath.replace(/^\/+/, "");
    const imageUrl = `${TRUTHSCAN_STORAGE_BASE}/${cleanPath}`;
    const body = JSON.stringify({
      key: this.apiKey,
      url: imageUrl,
      generate_preview: true,
      generate_analysis_details: true,
      generate_heatmap_overlayed: false,
      generate_heatmap_normalized: true,
    });
    const opts = {
      method: "POST" as const,
      url: `${this.apiBase}/detect`,
      headers: { "content-type": "application/json" },
      body,
    };

    const first = await this.callJson(
      log,
      "/detect",
      opts,
      detectResponseSchema,
      DETECT_TIMEOUT_MS,
    );
    if (first.ok) return first;

    // 4xx (non-5xx upstream statuses) do not retry.
    const isRetryable =
      first.kind === "timeout" ||
      (first.kind === "upstream" &&
        first.upstreamStatus !== undefined &&
        first.upstreamStatus >= 500);
    if (!isRetryable) return first;

    log.warn("truthscan.retry", {
      endpoint: "/detect",
      attemptN: 2,
      previousStatus: first.upstreamStatus ?? null,
    });
    await sleep(DETECT_RETRY_BACKOFF_MS);
    return this.callJson(
      log,
      "/detect",
      opts,
      detectResponseSchema,
      DETECT_TIMEOUT_MS,
    );
  }

  /**
   * POST /query with TruthScan's id for the scan (not ours). The caller
   * should scope the logger with our scanId first; this method adds
   * truthscanId to its own log lines for correlation with TruthScan support.
   */
  async query(
    log: Logger,
    truthscanId: string,
  ): Promise<TruthscanResult<QueryResponse>> {
    return this.callJson(
      log.with({ truthscanId }),
      "/query",
      {
        method: "POST",
        url: `${this.apiBase}/query`,
        headers: {
          "content-type": "application/json",
          apikey: this.apiKey,
        },
        body: JSON.stringify({ id: truthscanId }),
      },
      queryResponseSchema,
      DEFAULT_TIMEOUT_MS,
    );
  }

  async health(log: Logger): Promise<TruthscanResult<HealthResponse>> {
    return this.callJson(
      log,
      "/health",
      {
        method: "GET",
        url: `${this.apiBase}/health`,
        headers: {},
      },
      healthResponseSchema,
      DEFAULT_TIMEOUT_MS,
    );
  }

  /**
   * Fetches asset bytes. Accepts either a direct storage URL (GET, no auth
   * needed because it's presigned) or an API-host URL (POST with our key).
   * Decision is based on the URL's host: anything under the API base means
   * we need to POST with the key.
   *
   * `truthscanId` is required because TruthScan's API-host asset paths are
   * keyed on their id, not ours. The caller should scope the logger with
   * our scanId first; this method adds truthscanId to its own log lines.
   */
  async fetchAsset(
    log: Logger,
    kind: "preview" | "heatmap",
    truthscanId: string,
    urlOrNull: string | null,
  ): Promise<
    | { ok: true; status: number; body: ReadableStream<Uint8Array> | null; contentType: string | null }
    | { ok: false; status: number; reason: string }
  > {
    const scoped = log.with({ truthscanId });
    const started = Date.now();
    const endpoint = `/${kind}/:id`;
    let url: string;
    let init: RequestInit;

    if (urlOrNull) {
      const parsed = safeParseUrl(urlOrNull);
      if (!parsed) {
        scoped.error("truthscan.error", {
          endpoint,
          durationMs: Date.now() - started,
          reason: "bad_asset_url",
        });
        return { ok: false, status: 0, reason: "bad_asset_url" };
      }
      // If the host matches the API host, we need to POST with the key.
      // Otherwise it's a presigned storage URL — plain GET.
      const isApiHost = parsed.host === new URL(this.apiBase).host;
      if (isApiHost) {
        url = urlOrNull;
        init = {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key: this.apiKey }),
        };
      } else {
        url = urlOrNull;
        init = { method: "GET" };
      }
    } else {
      // No URL on the query response yet — fall back to the documented
      // API-host path POST /{kind}/{truthscanId}.
      url = `${this.apiBase}/${kind}/${truthscanId}`;
      init = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: this.apiKey }),
      };
    }

    try {
      const res = await fetch(url, init);
      scoped.info("truthscan.call", {
        endpoint,
        upstreamStatus: res.status,
        durationMs: Date.now() - started,
      });
      if (res.ok) {
        return {
          ok: true,
          status: res.status,
          body: res.body,
          contentType: res.headers.get("content-type"),
        };
      }
      return { ok: false, status: res.status, reason: `upstream_${res.status}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      scoped.error("truthscan.error", {
        endpoint,
        durationMs: Date.now() - started,
        reason: msg,
      });
      return { ok: false, status: 0, reason: msg };
    }
  }

  // === Shared call path ===

  private async callJson<T>(
    log: Logger,
    endpoint: string,
    opts: {
      method: "GET" | "POST";
      url: string;
      headers: Record<string, string>;
      body?: string;
    },
    schema: z.ZodSchema<T>,
    timeoutMs: number,
  ): Promise<TruthscanResult<T>> {
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(opts.url, {
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        signal: ctrl.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      // AbortError from our timeout vs genuine network error — distinguish
      // so alerting can treat them differently.
      if (err instanceof DOMException && err.name === "AbortError") {
        log.error("truthscan.timeout", { endpoint, timeoutMs, durationMs });
        return {
          ok: false,
          kind: "timeout",
          message: "timeout",
          durationMs,
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      log.error("truthscan.error", { endpoint, durationMs, reason: msg });
      return { ok: false, kind: "network", message: msg, durationMs };
    }
    clearTimeout(timer);
    const durationMs = Date.now() - started;

    if (!res.ok) {
      log.error("truthscan.error", {
        endpoint,
        upstreamStatus: res.status,
        durationMs,
      });
      return {
        ok: false,
        kind: "upstream",
        upstreamStatus: res.status,
        message: `upstream_${res.status}`,
        durationMs,
      };
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("truthscan.error", {
        endpoint,
        upstreamStatus: res.status,
        durationMs,
        reason: `json_parse: ${msg}`,
      });
      return {
        ok: false,
        kind: "schema",
        message: `json_parse: ${msg}`,
        durationMs,
      };
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // Include the raw response body on schema mismatch. This is the one
      // error path where we keep full upstream bodies in logs (normally
      // forbidden by OBSERVABILITY.md), because future TruthScan shape
      // drift will manifest here and having the body available makes
      // diagnosis a single-round-trip job instead of a deploy-to-debug
      // loop. No secrets cross TruthScan's response surface.
      log.error("truthscan.error", {
        endpoint,
        upstreamStatus: res.status,
        durationMs,
        reason: "schema_mismatch",
        issues: parsed.error.issues.slice(0, 5).map((i) => ({
          path: i.path.join("."),
          code: i.code,
        })),
        responseBody: safeStringify(json),
      });
      return {
        ok: false,
        kind: "schema",
        message: "schema_mismatch",
        durationMs,
      };
    }

    log.info("truthscan.call", {
      endpoint,
      upstreamStatus: res.status,
      durationMs,
    });
    return { ok: true, value: parsed.data, durationMs };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeParseUrl(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return "[unserializable]";
  }
}
