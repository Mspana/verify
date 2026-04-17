// Scan lifecycle handlers: upload-url, submit, get (poll), delete, restore.
//
// Two-phase quota:
//   upload-url → reserve slot + record reservation
//   submit     → commit slot + delete reservation
//   abandoned  → stale sweep on next upload-url releases it
//
// The ownership check (scan.userId === ctx.userId) lives in every read/write
// path; we don't distinguish "not yours" from "doesn't exist" (per ERRORS.md
// SCAN_NOT_FOUND: "same UX blocks enumeration").

import { Hono } from "hono";
import type {
  ErrorCode,
  Scan,
  SubmitRequest,
  SubmitResponse,
  UploadUrlRequest,
  UploadUrlResponse,
} from "@verify/shared";

import { err, type HonoEnv } from "../types.ts";
import {
  deleteScansIndex,
  deleteTrashIndex,
  getScan,
  getUser,
  putScan,
  putScansIndex,
  putTrashIndex,
  putUser,
  type ScanRecord,
} from "../lib/kv.ts";
import {
  commit,
  recordReservation,
  release,
  reserve,
  sweepStaleReservations,
} from "../lib/quota.ts";
import { TruthscanClient } from "../lib/truthscan.ts";
import { normalize } from "../normalize.ts";
import { emptySignals } from "../normalize.ts";

export const scanRoutes = new Hono<HonoEnv>();

// === Validation constants ===

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MIN_FILE_SIZE = 1024; // Matches TruthScan's own minimum per their docs.
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg", // non-canonical but some clients send it
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const MAX_SCAN_AGE_FOR_RESTORE_MS = 30 * 24 * 60 * 60 * 1000;

// ═════════════════════════════════════════════════════════════════════════
// POST /api/scan/upload-url
// ═════════════════════════════════════════════════════════════════════════

scanRoutes.post("/scan/upload-url", async (c) => {
  const userId = c.get("userId");
  const log = c.get("log");

  const body = await readJson<UploadUrlRequest>(c.req.raw);
  if (!body) {
    return c.json(err("INVALID_REQUEST", "Bad JSON body.", false), 400);
  }

  const valid = validateUploadRequest(body);
  if (!valid.ok) {
    return c.json(err(valid.code, valid.message, true), 400);
  }

  // Opportunistic cleanup of any reservations the user abandoned — prevents
  // a stuck upload from blocking the rest of their daily quota.
  await sweepStaleReservations(c.env.VERIFY_KV, log, userId);

  // Check quota BEFORE touching TruthScan — saves a credit call when the
  // user is over the cap, and a rejected scan doesn't belong on our books
  // anyway.
  const reserveRes = await reserve(c.env.VERIFY_KV, log, userId);
  if (!reserveRes.ok) {
    return c.json(
      err("QUOTA_EXCEEDED", "You've used all your scans for today.", false),
      429,
    );
  }

  const scanId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // Record reservation keyed by scanId so the stale sweep can target it.
  await recordReservation(c.env.VERIFY_KV, userId, scanId);

  const ts = new TruthscanClient(c.env.TRUTHSCAN_API_KEY, {
    apiBase: c.env.TRUTHSCAN_API_BASE,
  });
  const presign = await ts.getPresignedUrl(
    log,
    sanitizeFilename(valid.value.filename),
  );
  if (!presign.ok) {
    // Release the reservation — the user never had a chance to use it,
    // and we don't penalize the user for our upstream's failure.
    await release(c.env.VERIFY_KV, log, userId, scanId, "failed");
    return c.json(
      err(
        "INTERNAL_ERROR",
        "We couldn't prepare the upload. Please try again.",
        true,
      ),
      502,
    );
  }

  // Write a stub scan record so a poll against this scanId finds SOMETHING
  // — even if the user never calls submit. Submit will flesh it out, and
  // fill in truthscanId once TruthScan's /detect returns it.
  const stub: ScanRecord = {
    id: scanId,
    userId,
    state: "polling",
    createdAt,
    filename: valid.value.filename,
    filePath: presign.value.file_path,
    truthscanId: null,
    submittedAt: null,
    completedAt: null,
    deletedAt: null,
    verdict: { status: "pending" },
    preview: { status: "pending" },
    heatmap: { status: "pending" },
    analysis: { status: "pending" },
    signals: emptySignals(),
    error: null,
  };
  await putScan(c.env.VERIFY_KV, stub);

  log.info("scan.upload_url", {
    scanId,
    fileSize: valid.value.fileSize,
    fileType: valid.value.fileType,
  });

  const response: UploadUrlResponse = {
    uploadUrl: presign.value.presigned_url,
    filePath: presign.value.file_path,
    scanId,
  };
  return c.json(response);
});

// ═════════════════════════════════════════════════════════════════════════
// POST /api/scan/submit
// ═════════════════════════════════════════════════════════════════════════

scanRoutes.post("/scan/submit", async (c) => {
  const userId = c.get("userId");
  const log = c.get("log");

  const body = await readJson<SubmitRequest>(c.req.raw);
  if (!body || typeof body.scanId !== "string" || typeof body.filePath !== "string") {
    return c.json(
      err("INVALID_REQUEST", "Missing scanId or filePath.", false),
      400,
    );
  }

  const stub = await getScan(c.env.VERIFY_KV, body.scanId);
  if (!stub || stub.userId !== userId) {
    return c.json(
      err("SCAN_NOT_FOUND", "That scan isn't available.", false),
      404,
    );
  }

  // Defensive cross-check: the filePath the client echoes back must match
  // what we stored on upload-url. Prevents a user shuffling their own
  // in-flight uploads; cross-user misuse is already blocked by the
  // ownership check above.
  if (stub.filePath !== body.filePath) {
    return c.json(
      err("INVALID_REQUEST", "File reference doesn't match this scan.", false),
      400,
    );
  }

  const ts = new TruthscanClient(c.env.TRUTHSCAN_API_KEY, {
    apiBase: c.env.TRUTHSCAN_API_BASE,
  });
  // Scope the logger to our scanId once — the TruthScan client relies on
  // the caller doing this so every downstream truthscan.* log line carries
  // our correlation ID alongside truthscanId.
  const scoped = log.with({ scanId: body.scanId });
  // Pass the Spaces file_path as-is; the client joins it with the
  // configured storage base before calling /detect.
  const detect = await ts.detect(scoped, { filePath: stub.filePath });
  if (!detect.ok) {
    await release(c.env.VERIFY_KV, log, userId, body.scanId, "failed");
    // Mark the scan itself as errored so a later poll still finds state.
    const failed: ScanRecord = {
      ...stub,
      state: "error",
      error: err(
        "SUBMIT_FAILED",
        "We couldn't start the scan. Please try again.",
        true,
      ),
    };
    await putScan(c.env.VERIFY_KV, failed);
    log.error("scan.failed", {
      scanId: body.scanId,
      errorCode: "SUBMIT_FAILED",
      upstreamStatus: detect.upstreamStatus ?? null,
    });
    return c.json(
      err(
        "SUBMIT_FAILED",
        "The detection service didn't respond. Your image wasn't scanned.",
        true,
      ),
      502,
    );
  }

  // Commit the quota slot now that TruthScan has accepted the scan.
  await commit(c.env.VERIFY_KV, log, userId, body.scanId);

  // Bump scanCount on the user record.
  const user = await getUser(c.env.VERIFY_KV, userId);
  if (user) {
    await putUser(c.env.VERIFY_KV, userId, {
      ...user,
      lastSeenAt: new Date().toISOString(),
      scanCount: user.scanCount + 1,
    });
  }

  const submittedAt = new Date().toISOString();
  const truthscanId = detect.value.id;
  const updated: ScanRecord = { ...stub, submittedAt, truthscanId };
  await putScan(c.env.VERIFY_KV, updated);
  await putScansIndex(c.env.VERIFY_KV, userId, updated);

  log.info("scan.submit", { scanId: body.scanId, truthscanId });

  const response: SubmitResponse = { scanId: body.scanId, state: "polling" };
  return c.json(response);
});

// ═════════════════════════════════════════════════════════════════════════
// GET /api/scan/:id  (polling)
// ═════════════════════════════════════════════════════════════════════════

scanRoutes.get("/scan/:id", async (c) => {
  const userId = c.get("userId");
  const log = c.get("log");
  const scanId = c.req.param("id");

  const record = await getScan(c.env.VERIFY_KV, scanId);
  if (!record || record.userId !== userId) {
    return c.json(
      err("SCAN_NOT_FOUND", "That scan isn't available.", false),
      404,
    );
  }

  // Already terminal — return the stored record; no need to hit TruthScan.
  if (record.state === "complete" || record.state === "error") {
    return c.json(publicScan(record));
  }

  // Pre-submit state: user requested upload-url but never submitted — or
  // submit returned 2xx but we don't have a truthscanId yet (shouldn't
  // happen in practice). Nothing to poll — return what we have (everything
  // pending).
  if (!record.submittedAt || !record.truthscanId) {
    return c.json(publicScan(record));
  }

  const ts = new TruthscanClient(c.env.TRUTHSCAN_API_KEY, {
    apiBase: c.env.TRUTHSCAN_API_BASE,
  });
  const scoped = log.with({ scanId, truthscanId: record.truthscanId });
  const query = await ts.query(scoped, record.truthscanId);
  if (!query.ok) {
    // Transient upstream failure — don't mutate KV state, let the frontend
    // keep polling. Return the last stored record verbatim.
    return c.json(publicScan(record));
  }

  const { scan, verdictJustResolved } = normalize(
    query.value,
    {
      scanId,
      createdAt: record.createdAt,
      filename: record.filename,
    },
    record.state,
    log,
  );

  log.debug("scan.poll", {
    scanId,
    truthscanId: record.truthscanId,
    state: scan.state,
    heatmapStatus: scan.heatmap.status,
    analysisStatus: scan.analysis.status,
  });

  // Merge into the KV record. Preserve bookkeeping fields, take lifecycle
  // fields from the normalized output.
  const merged: ScanRecord = {
    ...record,
    state: scan.state,
    verdict: scan.verdict,
    preview: scan.preview,
    heatmap: scan.heatmap,
    analysis: scan.analysis,
    signals: scan.signals,
    error: scan.error,
  };

  // First time we see a terminal verdict — emit scan.complete / scan.failed
  // exactly once. The completedAt field guards against double-emission on
  // subsequent polls before state flips to complete/error in KV.
  if (verdictJustResolved && !record.completedAt) {
    merged.completedAt = new Date().toISOString();
    const submittedMs = record.submittedAt
      ? Date.parse(record.submittedAt)
      : Date.parse(record.createdAt);
    const durationMs = Date.parse(merged.completedAt) - submittedMs;
    if (scan.state === "error") {
      log.info("scan.failed", {
        scanId,
        truthscanId: record.truthscanId,
        errorCode: scan.error?.code ?? "SCAN_FAILED",
        upstreamStatus: null,
      });
    } else {
      log.info("scan.complete", {
        scanId,
        truthscanId: record.truthscanId,
        verdict:
          scan.verdict.status === "ready" ? scan.verdict.label : "unknown",
        aiLikelihood:
          scan.verdict.status === "ready" ? scan.verdict.aiLikelihood : null,
        agreement:
          scan.analysis.status === "ready" ? scan.analysis.agreement : null,
        durationMs,
      });
    }
  }

  await putScan(c.env.VERIFY_KV, merged);
  return c.json(publicScan(merged));
});

// ═════════════════════════════════════════════════════════════════════════
// DELETE /api/scan/:id
// ═════════════════════════════════════════════════════════════════════════

scanRoutes.delete("/scan/:id", async (c) => {
  const userId = c.get("userId");
  const log = c.get("log");
  const scanId = c.req.param("id");

  const record = await getScan(c.env.VERIFY_KV, scanId);
  if (!record || record.userId !== userId) {
    return c.json(
      err("SCAN_NOT_FOUND", "That scan isn't available.", false),
      404,
    );
  }

  if (record.deletedAt) {
    // Idempotent — already deleted.
    return c.json({ ok: true });
  }

  const deletedAt = new Date().toISOString();
  const updated: ScanRecord = { ...record, deletedAt };
  await putScan(c.env.VERIFY_KV, updated);
  await deleteScansIndex(c.env.VERIFY_KV, userId, record);
  await putTrashIndex(c.env.VERIFY_KV, userId, record);

  log.info("scan.deleted", { scanId });
  return c.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════════════
// POST /api/scan/:id/restore
// ═════════════════════════════════════════════════════════════════════════

scanRoutes.post("/scan/:id/restore", async (c) => {
  const userId = c.get("userId");
  const log = c.get("log");
  const scanId = c.req.param("id");

  const record = await getScan(c.env.VERIFY_KV, scanId);
  if (!record || record.userId !== userId || !record.deletedAt) {
    return c.json(
      err("SCAN_NOT_FOUND", "That scan isn't available.", false),
      404,
    );
  }

  // 30-day window: beyond that, the purge cron may have removed it already
  // or it's about to. Don't restore a scan that's on its way out.
  const age = Date.now() - Date.parse(record.deletedAt);
  if (age > MAX_SCAN_AGE_FOR_RESTORE_MS) {
    return c.json(
      err("SCAN_NOT_FOUND", "That scan has been permanently deleted.", false),
      410,
    );
  }

  const updated: ScanRecord = { ...record, deletedAt: null };
  await putScan(c.env.VERIFY_KV, updated);
  await deleteTrashIndex(c.env.VERIFY_KV, userId, record);
  await putScansIndex(c.env.VERIFY_KV, userId, updated);

  log.info("scan.restored", { scanId });
  return c.json({ ok: true });
});

// ═════════════════════════════════════════════════════════════════════════
// Helpers
// ═════════════════════════════════════════════════════════════════════════

type ValidationOk<T> = { ok: true; value: T };
type ValidationErr = {
  ok: false;
  code: ErrorCode;
  message: string;
};

function validateUploadRequest(
  req: UploadUrlRequest,
): ValidationOk<UploadUrlRequest> | ValidationErr {
  if (
    typeof req.filename !== "string" ||
    typeof req.fileSize !== "number" ||
    typeof req.fileType !== "string"
  ) {
    return {
      ok: false,
      code: "FILENAME_INVALID",
      message: "Missing file details.",
    };
  }
  if (req.fileSize > MAX_FILE_SIZE) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `This image is ${Math.round(req.fileSize / 1024 / 1024)} MB. Maximum is 10 MB.`,
    };
  }
  if (req.fileSize < MIN_FILE_SIZE) {
    return {
      ok: false,
      code: "FILE_TOO_SMALL",
      message: "This image is too small to analyze.",
    };
  }
  if (!ALLOWED_TYPES.has(req.fileType.toLowerCase())) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: "This file type isn't supported. Try JPG, PNG, or HEIC.",
    };
  }
  return { ok: true, value: req };
}

function sanitizeFilename(name: string): string {
  // TruthScan rejects spaces; we already require FILENAME_OK above but
  // belt-and-suspenders clean any straggler here.
  const cleaned = name.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
  return cleaned.length > 0 ? cleaned : "upload";
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** Strip internal-only fields (userId, filePath, submittedAt, etc.) before
 *  returning a scan to the client. */
function publicScan(record: ScanRecord): Scan {
  return {
    id: record.id,
    state: record.state,
    createdAt: record.createdAt,
    filename: record.filename,
    verdict: record.verdict,
    preview: record.preview,
    heatmap: record.heatmap,
    analysis: record.analysis,
    signals: record.signals,
    error: record.error,
  };
}

export { publicScan };
