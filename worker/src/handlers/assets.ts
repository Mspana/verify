// GET /api/scan/:id/preview and /api/scan/:id/heatmap
//
// Streams asset bytes from TruthScan, with ownership enforced against KV
// and a cache layer at the edge (1 hour for preview per ARCHITECTURE.md).
// Heatmap returns 202 when not yet ready — the frontend interprets that as
// "keep polling the scan record" rather than surfacing an error.
//
// The fetchAsset helper in truthscan.ts handles the dual-source case
// (direct storage URL vs API-host URL requiring POST+key).

import { Hono } from "hono";
import { err, type HonoEnv } from "../types.ts";
import { getScan } from "../lib/kv.ts";
import { TruthscanClient } from "../lib/truthscan.ts";

export const assetRoutes = new Hono<HonoEnv>();

assetRoutes.get("/scan/:id/preview", async (c) => {
  const userId = c.get("userId");
  const log = c.get("log");
  const scanId = c.req.param("id");

  const record = await getScan(c.env.VERIFY_KV, scanId);
  if (!record || record.userId !== userId) {
    // Ownership + existence collapse to the same response to block
    // enumeration. Frontend handles as SCAN_NOT_FOUND equivalent.
    return c.json(err("SCAN_NOT_FOUND", "Not found.", false), 404);
  }

  if (record.preview.status !== "ready" || !record.truthscanId) {
    // Missing truthscanId here shouldn't happen once verdict is ready (we
    // set it at submit), but guarding means we never call TruthScan with
    // our id — which would 404 anyway.
    return c.json(
      err("PREVIEW_UNAVAILABLE", "Preview isn't available.", false),
      404,
    );
  }

  // The normalized Scan only stores our proxy path; the raw TruthScan URL
  // isn't persisted. Fall back to the API-host path (POST /preview/:id) by
  // passing null — fetchAsset resolves that to the API path keyed on
  // truthscanId.
  const ts = new TruthscanClient(c.env.TRUTHSCAN_API_KEY, {
    apiBase: c.env.TRUTHSCAN_API_BASE,
  });
  const scoped = log.with({ scanId });
  const started = Date.now();
  const result = await ts.fetchAsset(scoped, "preview", record.truthscanId, null);
  if (!result.ok) {
    log.warn("asset.unavailable", {
      kind: "preview",
      scanId,
      reason: result.reason,
    });
    return c.json(
      err("PREVIEW_UNAVAILABLE", "Preview unavailable.", true),
      502,
    );
  }

  log.info("asset.serve", {
    kind: "preview",
    scanId,
    cacheHit: false,
    durationMs: Date.now() - started,
  });

  // Edge cache for 1 hour — preview bytes don't change.
  //
  // Access-Control-Allow-Origin: * is intentional. These bytes are
  // already gated by session auth (the 401 above), so open CORS on the
  // response doesn't widen who can read them — a cross-origin page
  // without the session cookie still gets 401, not the image. The open
  // grant unblocks client-side canvas rendering (html2canvas export)
  // which sets crossOrigin="anonymous" on <img> tags and refuses to
  // paint images without an ACAO header. No credentials flag — we
  // don't need cookies on this response for export.
  return new Response(result.body, {
    status: 200,
    headers: {
      "content-type": result.contentType ?? "image/jpeg",
      "cache-control": "public, max-age=3600, immutable",
      "access-control-allow-origin": "*",
    },
  });
});

assetRoutes.get("/scan/:id/heatmap", async (c) => {
  const userId = c.get("userId");
  const log = c.get("log");
  const scanId = c.req.param("id");

  const record = await getScan(c.env.VERIFY_KV, scanId);
  if (!record || record.userId !== userId) {
    return c.json(err("SCAN_NOT_FOUND", "Not found.", false), 404);
  }

  if (record.heatmap.status === "pending") {
    // Return 202 while TruthScan is still generating. Frontend treats this
    // as "retry later" without surfacing an error — matches the state
    // machine in ARCHITECTURE.md.
    return new Response(null, { status: 202 });
  }

  if (record.heatmap.status === "skipped") {
    // TruthScan decided no heatmap for this image (commonly on clearly
    // human verdicts). This is terminal — 202 would lie ("come back
    // later"); HEATMAP_UNAVAILABLE implies something broke. A 404 with
    // an explicit {status:"skipped"} body lets the frontend render the
    // "not available for this image" variant without an error icon.
    log.info("asset.unavailable", {
      kind: "heatmap",
      scanId,
      reason: "skipped",
    });
    return c.json({ status: "skipped" }, 404);
  }

  if (record.heatmap.status !== "ready" || !record.truthscanId) {
    log.warn("asset.unavailable", {
      kind: "heatmap",
      scanId,
      reason:
        record.truthscanId === null
          ? "no_truthscan_id"
          : record.heatmap.status, // "failed"
    });
    return c.json(
      err("HEATMAP_UNAVAILABLE", "Heatmap unavailable.", false),
      404,
    );
  }

  const ts = new TruthscanClient(c.env.TRUTHSCAN_API_KEY, {
    apiBase: c.env.TRUTHSCAN_API_BASE,
  });
  const scoped = log.with({ scanId });
  const started = Date.now();
  const result = await ts.fetchAsset(scoped, "heatmap", record.truthscanId, null);
  if (!result.ok) {
    log.warn("asset.unavailable", {
      kind: "heatmap",
      scanId,
      reason: result.reason,
    });
    return c.json(
      err("HEATMAP_UNAVAILABLE", "Heatmap unavailable.", true),
      502,
    );
  }

  log.info("asset.serve", {
    kind: "heatmap",
    scanId,
    cacheHit: false,
    durationMs: Date.now() - started,
  });

  // See the ACAO note on the preview handler above — same rationale.
  return new Response(result.body, {
    status: 200,
    headers: {
      "content-type": result.contentType ?? "image/png",
      "cache-control": "public, max-age=3600, immutable",
      "access-control-allow-origin": "*",
    },
  });
});
