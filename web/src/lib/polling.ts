import { useEffect, useState } from "react";
import type { Scan } from "@verify/shared";

import { ApiError, getScan } from "./api";

// useScan — poll GET /api/scan/:id until a terminal state is reached
// (complete | error) or the client-side ceiling fires (SCAN_TIMEOUT,
// client-synthesized per ERRORS.md since the Worker never emits it).
//
// Cadence: 2s → 2s → 3s → 4s → 5s → 5s... Stable enough to unit test,
// cheap enough in steady state. The first poll fires immediately on
// mount so the page doesn't dead-render for 2s while waiting.
//
// Navigate-away/come-back: the hook keys off scanId in its effect deps,
// so unmounting clears the timer and remounting resumes from poll #1 —
// no global in-flight state required. Idempotent on the Worker side.

/** Poll delay schedule (ms). Indexed by attempt count, clamped to last. */
export const POLL_DELAYS_MS = [2000, 2000, 3000, 4000, 5000];

/** Wall-clock ceiling. 2 min per ERRORS.md SCAN_TIMEOUT. */
export const SCAN_TIMEOUT_MS = 2 * 60 * 1000;

/** The synthesized timeout error, exposed via `hook.error` when the ceiling fires. */
export function scanTimeoutError(): ApiError {
  return new ApiError(
    "SCAN_TIMEOUT",
    "The scan took longer than expected.",
    true,
  );
}

export function delayForAttempt(attempt: number): number {
  const idx = Math.min(attempt, POLL_DELAYS_MS.length - 1);
  return POLL_DELAYS_MS[idx]!;
}

type Deps = {
  /** Overridable for tests; defaults to the real api.ts fetch. */
  fetchScan?: (scanId: string) => Promise<Scan>;
  /** Overridable for tests; defaults to window.setTimeout. */
  setTimer?: (cb: () => void, ms: number) => number;
  /** Overridable for tests; defaults to window.clearTimeout. */
  clearTimer?: (id: number) => void;
  /** Overridable for tests; defaults to Date.now. */
  now?: () => number;
};

export type UseScanResult = {
  /** Latest normalized scan, or null before the first response lands. */
  scan: Scan | null;
  /**
   * Terminal polling error — set when the loop stops on something other
   * than a natural complete/error state transition. Covers
   * SCAN_NOT_FOUND, RATE_LIMITED, and our synthesized SCAN_TIMEOUT.
   * Transient 5xx/network blips stay null — the loop keeps polling.
   */
  error: ApiError | null;
};

/**
 * Poll for a single scanId. Restarts automatically when scanId changes.
 * Stops polling when:
 *   - scan.state is "complete" or "error" (authoritative, server-side)
 *   - a semantic API error occurs (SCAN_NOT_FOUND, RATE_LIMITED, etc.)
 *   - the 2-minute client ceiling fires (error.code = SCAN_TIMEOUT)
 */
export function useScan(scanId: string, deps: Deps = {}): UseScanResult {
  const fetchScan = deps.fetchScan ?? getScan;
  const setTimer =
    deps.setTimer ?? ((cb, ms) => window.setTimeout(cb, ms) as unknown as number);
  const clearTimer =
    deps.clearTimer ?? ((id) => window.clearTimeout(id));
  const now = deps.now ?? (() => Date.now());

  const [scan, setScan] = useState<Scan | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    // New scanId — reset everything. Without this, a mid-flight navigate
    // (e.g. HomePage → /scan/:id → back → /scan/:other) would render
    // stale scan briefly before the next fetch lands.
    setScan(null);
    setError(null);

    let cancelled = false;
    let timerId: number | null = null;
    let attempt = 0;
    const startedAt = now();

    const stop = () => {
      if (timerId !== null) {
        clearTimer(timerId);
        timerId = null;
      }
    };

    const tick = async () => {
      attempt++;
      try {
        const next = await fetchScan(scanId);
        if (cancelled) return;
        setScan(next);
        if (next.state === "complete" || next.state === "error") {
          // Terminal per the contract — server owns the definition of
          // "done" (partial success, asset failures, etc. all roll up
          // into state). We never second-guess it.
          return;
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError) {
          const transient =
            e.isNetwork || (e.code === "INTERNAL_ERROR" && e.status >= 500);
          if (!transient) {
            setError(e);
            return;
          }
        } else {
          // Non-ApiError throw: bail with a generic error rather than
          // silently retry forever.
          setError(
            new ApiError(
              "INTERNAL_ERROR",
              "Something went wrong while loading this scan.",
              true,
            ),
          );
          return;
        }
      }

      if (cancelled) return;

      if (now() - startedAt >= SCAN_TIMEOUT_MS) {
        setError(scanTimeoutError());
        return;
      }

      timerId = setTimer(() => {
        timerId = null;
        void tick();
      }, delayForAttempt(attempt));
    };

    void tick();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  return { scan, error };
}
