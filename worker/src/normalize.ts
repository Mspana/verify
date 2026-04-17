// TruthScan /query response → our normalized Scan shape.
//
// This is the most important function in the Worker: one place where the
// upstream vocabulary becomes ours. Every change here is visible to the
// frontend without a type compile step catching it, so treat it accordingly.
//
// Verdict mapping rule (from ARCHITECTURE.md and Phase 2 direction): the
// label comes from TruthScan's `final_result` string via an explicit switch.
// DO NOT compute the label from the numeric `confidence` threshold — that
// decision was made deliberately and moving the logic off TruthScan's
// categorical output would desync us from their detector updates.
//
// Asset timeout synthesis: we convert `pending` heatmap/analysis to
// `failed` here once elapsed-since-createdAt exceeds 90s. This is
// intentional and lives in normalize (not the handler) because asset
// timeouts are SOFT failures and the frontend shouldn't have to reason
// about wall-clock thresholds for each section. Scan-level timeouts
// (SCAN_TIMEOUT, 2 min) are deliberately NOT synthesized here — those are
// hard state transitions the frontend already tracks via polling elapsed
// time, and keeping the Worker stateless at the scan level matches
// ARCHITECTURE.md.

import type {
  Analysis,
  AgreementStrength,
  Heatmap,
  KeyIndicator,
  Preview,
  Scan,
  ScanState,
  Signals,
  Verdict,
  VerdictLabel,
} from "@verify/shared";
import type { Logger } from "./lib/logger.ts";
import type { QueryResponse, TruthscanWarning } from "./lib/truthscan.ts";

const ASSET_TIMEOUT_MS = 90 * 1000;

/** Inputs the Worker owns — what we stored at upload-url/submit. */
export type NormalizeContext = {
  scanId: string;
  createdAt: string;
  filename: string;
  /** Used to compute asset timeouts. Same as createdAt for simplicity — we
   *  don't want heatmap/analysis clocks diverging from scan creation. */
  nowIso?: string;
};

export type NormalizeResult = {
  scan: Scan;
  /** True when core verdict became terminal in this response — used by the
   *  scan.poll handler to decide whether to emit scan.complete / scan.failed
   *  exactly once. */
  verdictJustResolved: boolean;
};

/**
 * Translate a TruthScan /query response into our Scan shape.
 *
 * `priorState` is the last state we stored in KV. If the core verdict
 * transitions from non-terminal to terminal in this call, we set
 * verdictJustResolved so the caller can log scan.complete exactly once.
 */
export function normalize(
  query: QueryResponse,
  ctx: NormalizeContext,
  priorState: ScanState | null,
  log: Logger,
): NormalizeResult {
  const now = ctx.nowIso ? Date.parse(ctx.nowIso) : Date.now();
  const elapsedMs = now - Date.parse(ctx.createdAt);

  // === Scan-level terminal error: TruthScan says the whole thing failed.
  // Returning early prevents us from accidentally reporting a "ready" asset
  // from a scan that couldn't finish.
  if (query.status === "failed") {
    const scan: Scan = {
      id: ctx.scanId,
      state: "error",
      createdAt: ctx.createdAt,
      filename: ctx.filename,
      verdict: { status: "failed" },
      preview: { status: "failed" },
      heatmap: { status: "failed" },
      analysis: { status: "failed" },
      signals: emptySignals(),
      error: {
        code: "SCAN_FAILED",
        message: "The scan couldn't finish. Try uploading again.",
        retryable: true,
      },
    };
    return {
      scan,
      verdictJustResolved: priorState !== "error",
    };
  }

  const rd = query.result_details ?? {};

  // === Verdict ===
  const verdict = deriveVerdict(query, rd, log, ctx.scanId);

  // === Preview ===
  // Preview is either present (we have a URL from TruthScan) or we assume
  // pending until verdict resolves. After verdict resolves, absence means
  // TruthScan skipped or failed it; we collapse to `failed` per Phase 2
  // direction and rely on the asset handler to log the actual reason.
  let preview: Preview;
  if (query.preview_url) {
    preview = {
      status: "ready",
      url: proxyPreviewUrl(ctx.scanId),
    };
  } else if (verdict.status === "ready") {
    preview = { status: "failed" };
  } else {
    preview = { status: "pending" };
  }

  // === Heatmap ===
  // Pass heatmap_status through without coalescing — undefined (field
  // absent; TruthScan hasn't decided yet) and null (TruthScan decided to
  // skip) mean different things to deriveHeatmap.
  const heatmap = deriveHeatmap(
    rd.heatmap_status,
    rd.heatmap_url ?? null,
    ctx.scanId,
    elapsedMs,
  );

  // === Analysis ===
  const analysis = deriveAnalysis(
    rd.analysis_results_status,
    rd.analysis_results ?? null,
    elapsedMs,
    log,
    ctx.scanId,
  );

  // === Signals ===
  const signals = deriveSignals(rd.warnings ?? undefined, rd.metadata ?? undefined);

  // === Top-level state ===
  const state = deriveState(verdict, heatmap, analysis);

  const scan: Scan = {
    id: ctx.scanId,
    state,
    createdAt: ctx.createdAt,
    filename: ctx.filename,
    verdict,
    preview,
    heatmap,
    analysis,
    signals,
    error: null,
  };

  const verdictJustResolved =
    (verdict.status === "ready" || verdict.status === "failed") &&
    priorState !== "partial" &&
    priorState !== "complete" &&
    priorState !== "error";

  return { scan, verdictJustResolved };
}

// === Verdict derivation ===

function deriveVerdict(
  q: QueryResponse,
  rd: NonNullable<QueryResponse["result_details"]>,
  log: Logger,
  scanId: string,
): Verdict {
  // TruthScan's status: "pending" | "analyzing" → we're still waiting.
  // "done" with is_valid: false means TruthScan finished but rejected the
  // image (e.g. unreadable) — we treat that as a scan-level failure.
  // "done" with no final_result string → upstream contract broke; failed.
  if (q.status === "pending" || q.status === "analyzing") {
    return { status: "pending" };
  }

  if (rd.is_valid === false) {
    return { status: "failed" };
  }

  const raw = rd.final_result;
  if (!raw) return { status: "pending" };

  const label = mapVerdictLabel(raw, log, scanId);
  const aiLikelihood = pickAiLikelihood(q.result, rd.confidence);
  const confidence = pickConfidence(rd.confidence, q.result);

  if (aiLikelihood === null || confidence === null) {
    // Verdict string without a percentage is useless — we can't render it.
    return { status: "failed" };
  }

  return {
    status: "ready",
    label,
    headline: headlineFor(label, raw),
    aiLikelihood,
    confidence,
  };
}

/**
 * TruthScan `final_result` → our VerdictLabel.
 *
 * Unknown strings fall through to "uncertain" AND emit a warning log so we
 * notice when TruthScan introduces a new verdict string instead of silently
 * misclassifying.
 */
function mapVerdictLabel(
  raw: string,
  log: Logger,
  scanId: string,
): VerdictLabel {
  switch (raw) {
    case "AI Generated":
      return "ai";
    case "AI Edited":
      return "ai";
    case "Real":
      return "human";
    case "Digitally Edited":
      return "uncertain";
    default:
      log.warn("normalize.unknown_verdict", { scanId, raw });
      return "uncertain";
  }
}

function headlineFor(label: VerdictLabel, raw: string): string {
  // Our display string is derived from our label, not from TruthScan's —
  // this insulates the frontend from wording changes on their side.
  switch (label) {
    case "ai":
      // Preserve the "AI Edited" vs "AI Generated" distinction in the
      // headline even though both collapse to `ai` as the branch key.
      return raw === "AI Edited" ? "AI edited" : "AI generated";
    case "human":
      return "Likely real";
    case "uncertain":
      return raw === "Digitally Edited" ? "Digitally edited" : "Can't verify";
  }
}

function pickAiLikelihood(
  resultField: number | null | undefined,
  confidenceField: number | undefined,
): number | null {
  // Per the TruthScan docs both `result` and `result_details.confidence`
  // carry the same ai-likelihood percentage; prefer `result` when present,
  // fall back to `confidence`.
  if (typeof resultField === "number") return round2(resultField);
  if (typeof confidenceField === "number") return round2(confidenceField);
  return null;
}

function pickConfidence(
  confidenceField: number | undefined,
  resultField: number | null | undefined,
): number | null {
  if (typeof confidenceField === "number") return round2(confidenceField);
  if (typeof resultField === "number") return round2(resultField);
  return null;
}

// === Heatmap derivation ===

function deriveHeatmap(
  status: "pending" | "ready" | "failed" | null | undefined,
  url: string | null,
  scanId: string,
  elapsedMs: number,
): Heatmap {
  if (status === "ready" && url) {
    return {
      status: "ready",
      url: proxyHeatmapUrl(scanId),
      // We always request transparent (generate_heatmap_normalized: true,
      // generate_heatmap_overlayed: false) — see ARCHITECTURE.md /detect flags.
      mode: "transparent",
    };
  }
  if (status === "failed") return { status: "failed" };
  // null from TruthScan means they deliberately skipped heatmap generation
  // for this image (common for clearly-human verdicts). Distinct from
  // `failed` so the UI can render "Heatmap not available for this image"
  // instead of a retry-style error.
  if (status === null) return { status: "skipped" };
  // Synthesize failed once 90s have elapsed — the frontend shouldn't need
  // to reason about wall-clock timeouts per-asset.
  if (elapsedMs > ASSET_TIMEOUT_MS) return { status: "failed" };
  return { status: "pending" };
}

// === Analysis derivation ===

function deriveAnalysis(
  status:
    | "pending"
    | "ready"
    | "skipped"
    | "failed"
    | "analyzing"
    | null
    | undefined,
  results: NonNullable<QueryResponse["result_details"]>["analysis_results"],
  elapsedMs: number,
  log: Logger,
  scanId: string,
): Analysis {
  if (status === "skipped" || status === null) return { status: "skipped" };
  if (status === "failed") return { status: "failed" };
  if (status === "ready" && results) {
    return buildAnalysis(results, log, scanId);
  }
  if (elapsedMs > ASSET_TIMEOUT_MS) return { status: "failed" };
  return { status: "pending" };
}

function buildAnalysis(
  r: NonNullable<
    NonNullable<QueryResponse["result_details"]>["analysis_results"]
  >,
  log: Logger,
  scanId: string,
): Analysis {
  const agreement = mapAgreement(r.agreement, log, scanId);
  // If agreement is missing or unparseable we treat the analysis as
  // failed rather than guessing — agreement drives a major UI element and
  // a wrong default ("strong" when it's actually "disagreement") would
  // actively mislead.
  if (!agreement) return { status: "failed" };

  const keyIndicators: KeyIndicator[] = (r.keyIndicators ?? []).map(
    (label) => ({
      // TruthScan gives us strings only — no signal for whether an
      // indicator supports or opposes the verdict. Defaulting to "verdict"
      // matches how their API presents them (all in service of the call).
      // When agreement is "disagreement" the UI draws the accent from that
      // section's own state, not from per-indicator flags.
      label,
      supports: "verdict",
    }),
  );

  return {
    status: "ready",
    agreement,
    imageTags: r.imageTags ?? [],
    keyIndicators,
    reasoning: r.detailedReasoning ?? "",
    recommendations: r.recommendations ?? [],
  };
}

function mapAgreement(
  raw: string | undefined,
  log: Logger,
  scanId: string,
): AgreementStrength | null {
  switch (raw) {
    case "strong":
    case "moderate":
    case "weak":
    case "disagreement":
      return raw;
    case undefined:
      return null;
    default:
      log.warn("normalize.unknown_agreement", { scanId, raw });
      return null;
  }
}

// === Signals derivation ===

function deriveSignals(
  warnings: TruthscanWarning[] | undefined,
  metadata: unknown[] | undefined,
): Signals {
  const list = warnings ?? [];
  // Production sends a `screen_recapture` warning on every response with
  // `metrics.is_screen` as the actual signal — `is_screen: false` means
  // TruthScan checked and it's NOT a screen capture. Presence of the
  // warning type alone doesn't imply detection.
  const screenRecapture = list.some(
    (w) =>
      w.type === "screen_recapture" &&
      typeof w.metrics === "object" &&
      w.metrics !== null &&
      (w.metrics as Record<string, unknown>).is_screen === true,
  );
  const watermarkRaw = list.find((w) => w.type === "watermark");
  const watermark = watermarkRaw
    ? {
        label: watermarkRaw.label ?? "Unknown",
        confidence: normalizeWatermarkConfidence(watermarkRaw.confidence),
      }
    : null;

  // TruthScan's docs don't expose a dedicated EXIF flag in the response
  // shape. Positive signal: metadata strings in their "EXIF: <value>" form
  // (observed: "EXIF: Canon EOS 5D"). The word-boundary + delimiter check
  // avoids false positives on names like "ExifTool" that appear in the
  // tool-chain descriptions on no-metadata responses.
  const hasExif = Array.isArray(metadata)
    ? metadata.some(
        (m) => typeof m === "string" && /\bexif\b\s*[:=]/i.test(m),
      )
    : false;

  return { hasExif, screenRecapture, watermark };
}

function normalizeWatermarkConfidence(c: number | undefined): number {
  if (typeof c !== "number") return 0;
  // TruthScan returns watermark confidence on a 0–1 scale in one spot and
  // 0–100 in another (the docs show both). Normalize to 0–100 so the
  // frontend doesn't need to know.
  if (c <= 1) return round2(c * 100);
  return round2(c);
}

// === State derivation ===

function deriveState(
  verdict: Verdict,
  heatmap: Heatmap,
  analysis: Analysis,
): ScanState {
  if (verdict.status === "pending") return "polling";
  if (verdict.status === "failed") return "error";
  // Verdict is ready. `complete` requires both assets to have reached a
  // terminal state (ready, failed, or skipped). Anything still pending keeps
  // us in `partial` so the frontend keeps polling.
  const heatmapTerminal = heatmap.status !== "pending";
  const analysisTerminal = analysis.status !== "pending";
  if (heatmapTerminal && analysisTerminal) return "complete";
  return "partial";
}

// === Utilities ===

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function proxyPreviewUrl(scanId: string): string {
  return `/api/scan/${scanId}/preview`;
}

function proxyHeatmapUrl(scanId: string): string {
  return `/api/scan/${scanId}/heatmap`;
}

export function emptySignals(): Signals {
  return { hasExif: false, screenRecapture: false, watermark: null };
}
