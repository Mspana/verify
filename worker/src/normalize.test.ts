import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { normalize, type NormalizeContext } from "./normalize.ts";
import { queryResponseSchema, type QueryResponse } from "./lib/truthscan.ts";
import type { Logger } from "./lib/logger.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, "..", "fixtures");

function loadFixture(name: string): QueryResponse {
  return JSON.parse(
    readFileSync(join(FIXTURES, name), "utf-8"),
  ) as QueryResponse;
}

function mkLogger(): Logger & {
  warns: { event: string; fields: unknown }[];
} {
  const warns: { event: string; fields: unknown }[] = [];
  const log: Logger = {
    with: () => log,
    debug: vi.fn(),
    info: vi.fn(),
    warn: (event, fields) => {
      warns.push({ event, fields });
    },
    error: vi.fn(),
  };
  return Object.assign(log, { warns });
}

function mkCtx(partial?: Partial<NormalizeContext>): NormalizeContext {
  return {
    scanId: "11111111-1111-4111-8111-111111111111",
    createdAt: "2026-04-16T14:22:00.000Z",
    filename: "portrait-outdoor.jpg",
    nowIso: "2026-04-16T14:22:10.000Z", // 10s after creation — no asset timeout
    ...partial,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Fixture-driven baselines — one case per scenario from the TruthScan docs.
// ────────────────────────────────────────────────────────────────────────

describe("normalize — fixtures", () => {
  it("(a) pending with empty result_details → everything in pending", () => {
    const log = mkLogger();
    const { scan, verdictJustResolved } = normalize(
      loadFixture("query-pending-empty.json"),
      mkCtx(),
      null,
      log,
    );
    expect(scan.state).toBe("polling");
    expect(scan.verdict.status).toBe("pending");
    expect(scan.heatmap.status).toBe("pending");
    expect(scan.analysis.status).toBe("pending");
    expect(scan.preview.status).toBe("pending");
    expect(scan.error).toBeNull();
    expect(verdictJustResolved).toBe(false);
    // Should not throw, should not log warnings.
    expect(log.warns).toHaveLength(0);
  });

  it("(b) verdict ready, heatmap + analysis pending → partial", () => {
    const log = mkLogger();
    const { scan, verdictJustResolved } = normalize(
      loadFixture("query-verdict-ready-assets-pending.json"),
      mkCtx(),
      "polling",
      log,
    );
    expect(scan.state).toBe("partial");
    expect(scan.verdict).toMatchObject({
      status: "ready",
      label: "ai",
      headline: "AI generated",
    });
    expect(scan.heatmap.status).toBe("pending");
    expect(scan.analysis.status).toBe("pending");
    expect(scan.preview).toMatchObject({
      status: "ready",
      url: "/api/scan/11111111-1111-4111-8111-111111111111/preview",
    });
    expect(verdictJustResolved).toBe(true);
  });

  it("(c) heatmap ready, analysis pending → still partial", () => {
    const log = mkLogger();
    const { scan } = normalize(
      loadFixture("query-heatmap-ready-analysis-pending.json"),
      mkCtx(),
      "partial",
      log,
    );
    expect(scan.state).toBe("partial");
    expect(scan.heatmap).toMatchObject({
      status: "ready",
      mode: "transparent",
      url: "/api/scan/11111111-1111-4111-8111-111111111111/heatmap",
    });
    expect(scan.analysis.status).toBe("pending");
  });

  it("(d) everything ready → complete with full analysis", () => {
    const log = mkLogger();
    const { scan } = normalize(
      loadFixture("query-complete.json"),
      mkCtx(),
      "partial",
      log,
    );
    expect(scan.state).toBe("complete");
    if (scan.verdict.status !== "ready") throw new Error("expected ready");
    expect(scan.verdict.label).toBe("ai");
    expect(scan.verdict.aiLikelihood).toBeCloseTo(90.24, 2);
    if (scan.analysis.status !== "ready") throw new Error("expected ready");
    expect(scan.analysis.agreement).toBe("strong");
    expect(scan.analysis.imageTags).toContain("person");
    expect(scan.analysis.keyIndicators).toEqual([
      { label: "Unnaturally smooth skin texture", supports: "verdict" },
      { label: "Consistent lighting anomalies", supports: "verdict" },
    ]);
    expect(scan.analysis.reasoning).toMatch(/AI generation/);
    expect(scan.analysis.recommendations).toHaveLength(3);
    // EXIF inferred from the metadata string "EXIF: Canon EOS 5D".
    expect(scan.signals.hasExif).toBe(true);
  });

  it("(e) analysis skipped → analysis status skipped, scan complete", () => {
    const log = mkLogger();
    const { scan } = normalize(
      loadFixture("query-analysis-skipped.json"),
      mkCtx(),
      "partial",
      log,
    );
    expect(scan.state).toBe("complete");
    expect(scan.analysis.status).toBe("skipped");
    if (scan.verdict.status !== "ready") throw new Error("expected ready");
    expect(scan.verdict.label).toBe("human");
    expect(scan.verdict.headline).toBe("Likely real");
  });

  it("(f) warnings with screen_recapture and watermark populate signals", () => {
    const log = mkLogger();
    const { scan } = normalize(
      loadFixture("query-with-warnings.json"),
      mkCtx(),
      "polling",
      log,
    );
    expect(scan.signals.screenRecapture).toBe(true);
    expect(scan.signals.watermark).toEqual({
      label: "Gemini",
      // 0.95 → 95 (normalized to 0–100 scale).
      confidence: 95,
    });
    expect(scan.signals.hasExif).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Verdict mapping matrix — the switch in normalize.ts is load-bearing.
// ────────────────────────────────────────────────────────────────────────

describe("normalize — verdict mapping", () => {
  const base: QueryResponse = {
    id: "x",
    status: "done",
    result: 70,
    result_details: {
      is_valid: true,
      final_result: "PLACEHOLDER",
      confidence: 70,
      heatmap_status: "ready",
      heatmap_url: "https://storage.example/h",
      analysis_results_status: "skipped",
      analysis_results: null,
      warnings: [],
    },
    preview_url: "https://storage.example/p",
  };

  const cases: Array<[string, "ai" | "human" | "uncertain", string]> = [
    ["AI Generated", "ai", "AI generated"],
    ["AI Edited", "ai", "AI edited"],
    ["Real", "human", "Likely real"],
    ["Digitally Edited", "uncertain", "Digitally edited"],
  ];

  for (const [raw, label, headline] of cases) {
    it(`"${raw}" → ${label}`, () => {
      const log = mkLogger();
      const { scan } = normalize(
        {
          ...base,
          result_details: { ...base.result_details!, final_result: raw },
        },
        mkCtx(),
        "polling",
        log,
      );
      if (scan.verdict.status !== "ready") throw new Error("expected ready");
      expect(scan.verdict.label).toBe(label);
      expect(scan.verdict.headline).toBe(headline);
      expect(log.warns).toHaveLength(0);
    });
  }

  it("unknown verdict string → uncertain AND logs normalize.unknown_verdict", () => {
    const log = mkLogger();
    const { scan } = normalize(
      {
        ...base,
        result_details: {
          ...base.result_details!,
          final_result: "Synthetic-but-retouched",
        },
      },
      mkCtx(),
      "polling",
      log,
    );
    if (scan.verdict.status !== "ready") throw new Error("expected ready");
    expect(scan.verdict.label).toBe("uncertain");
    expect(log.warns).toEqual([
      {
        event: "normalize.unknown_verdict",
        fields: {
          scanId: "11111111-1111-4111-8111-111111111111",
          raw: "Synthetic-but-retouched",
        },
      },
    ]);
  });

  it("done + is_valid: false → verdict failed, scan state error", () => {
    const log = mkLogger();
    const { scan } = normalize(
      {
        ...base,
        result_details: {
          ...base.result_details!,
          is_valid: false,
          final_result: "AI Generated",
        },
      },
      mkCtx(),
      "polling",
      log,
    );
    expect(scan.verdict.status).toBe("failed");
    expect(scan.state).toBe("error");
  });

  it("done but no final_result yet → verdict stays pending", () => {
    const log = mkLogger();
    const { scan } = normalize(
      {
        ...base,
        result_details: { ...base.result_details!, final_result: undefined },
      },
      mkCtx(),
      null,
      log,
    );
    expect(scan.verdict.status).toBe("pending");
  });
});

// ────────────────────────────────────────────────────────────────────────
// Scan-level failures
// ────────────────────────────────────────────────────────────────────────

describe("normalize — scan-level failures", () => {
  it('status: "failed" → scan.state "error" with SCAN_FAILED', () => {
    const log = mkLogger();
    const { scan, verdictJustResolved } = normalize(
      { id: "x", status: "failed" },
      mkCtx(),
      "polling",
      log,
    );
    expect(scan.state).toBe("error");
    expect(scan.error).toEqual({
      code: "SCAN_FAILED",
      message: expect.any(String),
      retryable: true,
    });
    expect(scan.verdict.status).toBe("failed");
    expect(scan.heatmap.status).toBe("failed");
    expect(scan.analysis.status).toBe("failed");
    expect(verdictJustResolved).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// State derivation truth table
// ────────────────────────────────────────────────────────────────────────

describe("normalize — state derivation", () => {
  // verdict, heatmap, analysis → expected state
  const truthTable: Array<
    [string, "pending" | "ready", "pending" | "ready" | "failed" | "skipped", "pending" | "ready" | "failed" | "skipped", "polling" | "partial" | "complete"]
  > = [
    ["all pending", "pending", "pending", "pending", "polling"],
    ["verdict only", "ready", "pending", "pending", "partial"],
    ["verdict + heatmap", "ready", "ready", "pending", "partial"],
    ["verdict + analysis", "ready", "pending", "ready", "partial"],
    ["all ready", "ready", "ready", "ready", "complete"],
    ["heatmap failed counts as terminal", "ready", "failed", "ready", "complete"],
    ["analysis skipped counts as terminal", "ready", "ready", "skipped", "complete"],
    ["both assets failed", "ready", "failed", "failed", "complete"],
  ];

  for (const [name, v, h, a, expected] of truthTable) {
    it(name, () => {
      const log = mkLogger();
      const query: QueryResponse = {
        id: "x",
        status: v === "pending" ? "pending" : "done",
        result: v === "ready" ? 80 : null,
        result_details: {
          is_valid: true,
          final_result: v === "ready" ? "AI Generated" : undefined,
          confidence: v === "ready" ? 80 : undefined,
          heatmap_status:
            h === "pending" || h === "ready" || h === "failed" ? h : "ready",
          heatmap_url:
            h === "ready" ? "https://storage.example/h" : null,
          analysis_results_status: a,
          analysis_results:
            a === "ready"
              ? {
                  agreement: "strong",
                  imageTags: [],
                  keyIndicators: [],
                  detailedReasoning: "",
                  recommendations: [],
                }
              : null,
          warnings: [],
        },
        preview_url: "https://storage.example/p",
      };
      const { scan } = normalize(query, mkCtx(), "polling", log);
      expect(scan.state).toBe(expected);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────
// Asset timeout synthesis
// ────────────────────────────────────────────────────────────────────────

describe("normalize — asset timeout synthesis", () => {
  it("pending heatmap past 90s → synthesized failed", () => {
    const log = mkLogger();
    // Fixture (b) has heatmap pending; bump now to 91s after createdAt.
    const { scan } = normalize(
      loadFixture("query-verdict-ready-assets-pending.json"),
      mkCtx({ nowIso: "2026-04-16T14:23:31.000Z" }),
      "partial",
      log,
    );
    expect(scan.heatmap.status).toBe("failed");
    expect(scan.analysis.status).toBe("failed");
    // With both assets terminal, the scan is now complete despite TruthScan
    // still reporting them pending.
    expect(scan.state).toBe("complete");
  });

  it("pending heatmap well under 90s → stays pending", () => {
    const log = mkLogger();
    const { scan } = normalize(
      loadFixture("query-verdict-ready-assets-pending.json"),
      mkCtx({ nowIso: "2026-04-16T14:22:30.000Z" }),
      "partial",
      log,
    );
    expect(scan.heatmap.status).toBe("pending");
    expect(scan.analysis.status).toBe("pending");
  });
});

// ────────────────────────────────────────────────────────────────────────
// Agreement mapping
// ────────────────────────────────────────────────────────────────────────

describe("normalize — agreement mapping", () => {
  for (const agreement of [
    "strong",
    "moderate",
    "weak",
    "disagreement",
  ] as const) {
    it(`"${agreement}" passes through`, () => {
      const log = mkLogger();
      const { scan } = normalize(
        {
          id: "x",
          status: "done",
          result: 80,
          result_details: {
            is_valid: true,
            final_result: "AI Generated",
            confidence: 80,
            heatmap_status: "ready",
            heatmap_url: "https://storage.example/h",
            analysis_results_status: "ready",
            analysis_results: {
              agreement,
              imageTags: [],
              keyIndicators: [],
              detailedReasoning: "",
              recommendations: [],
            },
            warnings: [],
          },
          preview_url: "https://storage.example/p",
        },
        mkCtx(),
        "partial",
        log,
      );
      if (scan.analysis.status !== "ready") throw new Error("expected ready");
      expect(scan.analysis.agreement).toBe(agreement);
    });
  }

  it("unknown agreement → analysis failed AND logs warning", () => {
    const log = mkLogger();
    const { scan } = normalize(
      {
        id: "x",
        status: "done",
        result: 80,
        result_details: {
          is_valid: true,
          final_result: "AI Generated",
          confidence: 80,
          heatmap_status: "ready",
          heatmap_url: "https://storage.example/h",
          analysis_results_status: "ready",
          analysis_results: {
            // Intentionally invalid to probe fallback — schema.agreement is
            // z.string() at the boundary; normalize must still catch it.
            agreement: "very-strong",
            imageTags: [],
            keyIndicators: [],
            detailedReasoning: "",
            recommendations: [],
          },
          warnings: [],
        },
        preview_url: "https://storage.example/p",
      },
      mkCtx(),
      "partial",
      log,
    );
    expect(scan.analysis.status).toBe("failed");
    expect(log.warns.map((w) => w.event)).toContain(
      "normalize.unknown_agreement",
    );
  });
});

// ────────────────────────────────────────────────────────────────────────
// Signals edge cases
// ────────────────────────────────────────────────────────────────────────

describe("normalize — signals", () => {
  it("no warnings → everything default", () => {
    const log = mkLogger();
    const { scan } = normalize(
      loadFixture("query-complete.json"),
      mkCtx(),
      "partial",
      log,
    );
    expect(scan.signals.screenRecapture).toBe(false);
    expect(scan.signals.watermark).toBeNull();
  });

  it("watermark confidence already in 0–100 scale passes through", () => {
    const log = mkLogger();
    const { scan } = normalize(
      {
        id: "x",
        status: "done",
        result: 80,
        result_details: {
          is_valid: true,
          final_result: "AI Generated",
          confidence: 80,
          heatmap_status: "ready",
          heatmap_url: "https://storage.example/h",
          analysis_results_status: "skipped",
          analysis_results: null,
          warnings: [{ type: "watermark", label: "Imagen", confidence: 87 }],
        },
        preview_url: "https://storage.example/p",
      },
      mkCtx(),
      "polling",
      log,
    );
    expect(scan.signals.watermark).toEqual({ label: "Imagen", confidence: 87 });
  });

  it("watermark with no confidence → 0", () => {
    const log = mkLogger();
    const { scan } = normalize(
      {
        id: "x",
        status: "done",
        result: 80,
        result_details: {
          is_valid: true,
          final_result: "AI Generated",
          confidence: 80,
          heatmap_status: "ready",
          heatmap_url: "https://storage.example/h",
          analysis_results_status: "skipped",
          analysis_results: null,
          warnings: [{ type: "watermark", label: "DALL-E" }],
        },
        preview_url: "https://storage.example/p",
      },
      mkCtx(),
      "polling",
      log,
    );
    expect(scan.signals.watermark).toEqual({
      label: "DALL-E",
      confidence: 0,
    });
  });

  it('metadata string "No EXIF" does NOT flip hasExif', () => {
    const log = mkLogger();
    const { scan } = normalize(
      {
        id: "x",
        status: "done",
        result: 80,
        result_details: {
          is_valid: true,
          final_result: "Real",
          confidence: 20,
          metadata: ["No EXIF data"],
          heatmap_status: "ready",
          heatmap_url: "https://storage.example/h",
          analysis_results_status: "skipped",
          analysis_results: null,
          warnings: [],
        },
        preview_url: "https://storage.example/p",
      },
      mkCtx(),
      "polling",
      log,
    );
    expect(scan.signals.hasExif).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Asset URL rewrites — critical regression guard.
// ────────────────────────────────────────────────────────────────────────

describe("normalize — asset URLs never leak upstream", () => {
  it("always rewrites to /api/scan/:id proxy paths", () => {
    const log = mkLogger();
    const { scan } = normalize(
      loadFixture("query-complete.json"),
      mkCtx({ scanId: "deadbeef-dead-4eaf-bead-beefdeadbeef" }),
      "partial",
      log,
    );
    if (scan.preview.status !== "ready") throw new Error("expected preview");
    if (scan.heatmap.status !== "ready") throw new Error("expected heatmap");
    expect(scan.preview.url).toBe(
      "/api/scan/deadbeef-dead-4eaf-bead-beefdeadbeef/preview",
    );
    expect(scan.heatmap.url).toBe(
      "/api/scan/deadbeef-dead-4eaf-bead-beefdeadbeef/heatmap",
    );
    expect(scan.preview.url).not.toContain("truthscan");
    expect(scan.heatmap.url).not.toContain("truthscan");
  });
});

// ────────────────────────────────────────────────────────────────────────
// Real production response — drawn verbatim from a failing /query captured
// live. Pins the behavior for the common "clearly human, no heatmap"
// variant that exposed null values in fields previously schema-required.
// ────────────────────────────────────────────────────────────────────────

describe("normalize — real production response (human verdict, heatmap skipped)", () => {
  it("parses through the Zod schema without errors", () => {
    // Regression guard for schema drift: if TruthScan reintroduces a
    // strict type somewhere our schema currently tolerates, this flips red.
    const raw = JSON.parse(
      readFileSync(join(FIXTURES, "query_real_done.json"), "utf-8"),
    );
    const parsed = queryResponseSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it("produces a complete Scan with human verdict and skipped heatmap", () => {
    const log = mkLogger();
    const { scan } = normalize(
      loadFixture("query_real_done.json"),
      mkCtx(),
      "polling",
      log,
    );

    if (scan.verdict.status !== "ready") throw new Error("expected ready");
    expect(scan.verdict.label).toBe("human");
    expect(scan.verdict.headline).toBe("Likely real");
    expect(scan.verdict.aiLikelihood).toBeCloseTo(2.44, 2);

    if (scan.analysis.status !== "ready") throw new Error("expected ready");
    expect(scan.analysis.agreement).toBe("strong");
    expect(scan.analysis.imageTags).toContain("walrus");

    // heatmap_status: null → skipped. The scan is terminal; the frontend
    // shouldn't re-poll or surface a retry-style error.
    expect(scan.heatmap.status).toBe("skipped");

    // With verdict ready, heatmap skipped (terminal), analysis ready
    // (terminal), the scan reaches complete despite skipping partial.
    expect(scan.state).toBe("complete");

    // hasExif must be false — the metadata strings mention "ExifTool" as
    // a tool name, not actual EXIF data.
    expect(scan.signals.hasExif).toBe(false);

    // No watermark warning → null.
    expect(scan.signals.watermark).toBeNull();

    // screen_recapture warning is present, but metrics.is_screen === false
    // means TruthScan checked and it's NOT a screen capture. screenRecapture
    // must be false; the warning's presence alone isn't sufficient.
    expect(scan.signals.screenRecapture).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Two-identifier invariant — the /query response carries TruthScan's id
// (truthscanId), which will NOT match our scanId. normalize must emit our
// scanId on the returned Scan and in the proxy URLs — it must never leak
// TruthScan's id through. Regression guard for the upload-flow fix.
// ────────────────────────────────────────────────────────────────────────

describe("normalize — scanId vs truthscanId", () => {
  it("uses ctx.scanId everywhere; ignores TruthScan's id on the query response", () => {
    const log = mkLogger();
    const query: QueryResponse = {
      ...loadFixture("query-complete.json"),
      // Deliberately a different UUID from ctx.scanId below. In production
      // this is what `truthscanId` holds on the KV record.
      id: "cafebabe-cafe-4afe-8afe-cafebabecafe",
    };
    const ctx = mkCtx({ scanId: "11111111-1111-4111-8111-111111111111" });
    const { scan } = normalize(query, ctx, "partial", log);

    // Top-level id is ours.
    expect(scan.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(scan.id).not.toBe(query.id);

    // Proxy URLs carry our scanId, not theirs.
    if (scan.preview.status !== "ready") throw new Error("expected preview");
    if (scan.heatmap.status !== "ready") throw new Error("expected heatmap");
    expect(scan.preview.url).toBe(
      "/api/scan/11111111-1111-4111-8111-111111111111/preview",
    );
    expect(scan.heatmap.url).toBe(
      "/api/scan/11111111-1111-4111-8111-111111111111/heatmap",
    );
    expect(scan.preview.url).not.toContain(query.id);
    expect(scan.heatmap.url).not.toContain(query.id);
  });
});

// ────────────────────────────────────────────────────────────────────────
// verdictJustResolved edge cases
// ────────────────────────────────────────────────────────────────────────

describe("normalize — verdictJustResolved", () => {
  it("false when prior state was already partial", () => {
    const log = mkLogger();
    const { verdictJustResolved } = normalize(
      loadFixture("query-complete.json"),
      mkCtx(),
      "partial",
      log,
    );
    expect(verdictJustResolved).toBe(false);
  });

  it("true on first transition from polling → partial/complete", () => {
    const log = mkLogger();
    const { verdictJustResolved } = normalize(
      loadFixture("query-complete.json"),
      mkCtx(),
      "polling",
      log,
    );
    expect(verdictJustResolved).toBe(true);
  });
});
