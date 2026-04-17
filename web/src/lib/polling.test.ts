import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Scan } from "@verify/shared";

import { ApiError } from "./api";
import {
  POLL_DELAYS_MS,
  SCAN_TIMEOUT_MS,
  delayForAttempt,
  useScan,
} from "./polling";

// Controlled fake clock injected via the hook's deps. Lets us assert
// pending delays and fire one timer at a time — simpler than vi fake
// timers for an async hook whose state transitions depend on
// awaited fetchScan() resolutions between ticks.
class FakeClock {
  now = 0;
  private nextId = 1;
  private timers = new Map<number, { cb: () => void; fireAt: number }>();

  set = (cb: () => void, ms: number): number => {
    const id = this.nextId++;
    this.timers.set(id, { cb, fireAt: this.now + ms });
    return id;
  };

  clear = (id: number): void => {
    this.timers.delete(id);
  };

  nowFn = (): number => this.now;

  async fireNext(): Promise<void> {
    const entries = [...this.timers.entries()];
    if (entries.length === 0) {
      throw new Error("no pending timers to fire");
    }
    entries.sort((a, b) => a[1].fireAt - b[1].fireAt);
    const [id, entry] = entries[0]!;
    this.timers.delete(id);
    this.now = entry.fireAt;
    entry.cb();
    // Let the awaited fetchScan and the setState that follows flush.
    await Promise.resolve();
    await Promise.resolve();
  }

  pendingCount(): number {
    return this.timers.size;
  }

  pendingDelays(): number[] {
    return [...this.timers.values()].map((t) => t.fireAt - this.now);
  }
}

function scan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: "s1",
    state: "polling",
    createdAt: "2026-04-17T12:00:00Z",
    filename: "x.jpg",
    verdict: { status: "pending" },
    preview: { status: "pending" },
    heatmap: { status: "pending" },
    analysis: { status: "pending" },
    signals: { hasExif: false, screenRecapture: false, watermark: null },
    error: null,
    ...overrides,
  };
}

type Hookable = {
  clock: FakeClock;
  fetchScan: ReturnType<typeof vi.fn>;
};

function mount(fetchScan: ReturnType<typeof vi.fn>): Hookable & {
  result: ReturnType<typeof renderHook<ReturnType<typeof useScan>, unknown>>["result"];
} {
  const clock = new FakeClock();
  const { result } = renderHook(() =>
    useScan("s1", {
      fetchScan,
      setTimer: clock.set,
      clearTimer: clock.clear,
      now: clock.nowFn,
    }),
  );
  return { clock, fetchScan, result };
}

describe("delayForAttempt", () => {
  it("uses the schedule for early polls", () => {
    expect(delayForAttempt(1)).toBe(POLL_DELAYS_MS[1]);
    expect(delayForAttempt(2)).toBe(POLL_DELAYS_MS[2]);
  });

  it("clamps to 5s after the schedule exhausts", () => {
    expect(delayForAttempt(20)).toBe(5000);
    expect(delayForAttempt(100)).toBe(5000);
  });
});

describe("useScan — terminal state transitions", () => {
  it("polls until state is complete, then stops", async () => {
    const fetchScan = vi
      .fn()
      .mockResolvedValueOnce(scan({ state: "polling" }))
      .mockResolvedValueOnce(scan({ state: "partial" }))
      .mockResolvedValueOnce(scan({ state: "complete" }));
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.scan?.state).toBe("polling"));
    expect(fetchScan).toHaveBeenCalledTimes(1);
    expect(clock.pendingCount()).toBe(1);

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(result.current.scan?.state).toBe("partial"));
    expect(fetchScan).toHaveBeenCalledTimes(2);

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(result.current.scan?.state).toBe("complete"));
    expect(fetchScan).toHaveBeenCalledTimes(3);

    // No next timer scheduled — loop stopped on terminal state.
    expect(clock.pendingCount()).toBe(0);
  });

  it("stops polling when state reaches error", async () => {
    const fetchScan = vi
      .fn()
      .mockResolvedValueOnce(scan({ state: "polling" }))
      .mockResolvedValueOnce(
        scan({
          state: "error",
          error: {
            code: "SCAN_FAILED",
            message: "The image couldn't be read.",
            retryable: true,
          },
        }),
      );
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.scan?.state).toBe("polling"));
    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(result.current.scan?.state).toBe("error"));
    expect(clock.pendingCount()).toBe(0);
  });
});

describe("useScan — partial-success invariant", () => {
  // This is the most easy-to-break property in the polling logic: the
  // hook trusts the server's top-level `state` and never second-guesses
  // it from the asset sub-statuses. "Partial success is success" per
  // ERRORS.md — heatmap and/or analysis individually skipped or failed
  // must still let the scan reach state=complete and the loop stop.

  it("treats state=complete as terminal when heatmap is skipped and analysis is ready", async () => {
    const fetchScan = vi.fn().mockResolvedValueOnce(
      scan({
        state: "complete",
        verdict: {
          status: "ready",
          label: "human",
          headline: "Likely real",
          aiLikelihood: 6,
          confidence: 90,
        },
        heatmap: { status: "skipped" },
        analysis: {
          status: "ready",
          agreement: "strong",
          imageTags: ["portrait"],
          keyIndicators: [],
          reasoning: "",
          recommendations: [],
        },
      }),
    );
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.scan?.state).toBe("complete"));
    expect(clock.pendingCount()).toBe(0);
    expect(fetchScan).toHaveBeenCalledTimes(1);
  });

  it("treats state=complete as terminal when analysis is skipped and heatmap is ready", async () => {
    const fetchScan = vi.fn().mockResolvedValueOnce(
      scan({
        state: "complete",
        verdict: {
          status: "ready",
          label: "ai",
          headline: "AI generated",
          aiLikelihood: 91,
          confidence: 91,
        },
        heatmap: {
          status: "ready",
          url: "/api/scan/s1/heatmap",
          mode: "transparent",
        },
        analysis: { status: "skipped" },
      }),
    );
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.scan?.state).toBe("complete"));
    expect(clock.pendingCount()).toBe(0);
  });

  it("treats state=complete as terminal when both heatmap and analysis failed", async () => {
    const fetchScan = vi.fn().mockResolvedValueOnce(
      scan({
        state: "complete",
        verdict: {
          status: "ready",
          label: "uncertain",
          headline: "Can't verify",
          aiLikelihood: 52,
          confidence: 52,
        },
        heatmap: { status: "failed" },
        analysis: { status: "failed" },
      }),
    );
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.scan?.state).toBe("complete"));
    expect(clock.pendingCount()).toBe(0);
  });

  it("keeps polling through partial (assets still pending) and stops at complete, regardless of which asset terminated first", async () => {
    const fetchScan = vi
      .fn()
      // poll 1: verdict lands, heatmap skipped, analysis still pending → partial
      .mockResolvedValueOnce(
        scan({
          state: "partial",
          verdict: {
            status: "ready",
            label: "human",
            headline: "Likely real",
            aiLikelihood: 5,
            confidence: 90,
          },
          heatmap: { status: "skipped" },
          analysis: { status: "pending" },
        }),
      )
      // poll 2: analysis lands → complete. heatmap is still skipped; the
      // server rolls up to complete because all three are in terminal states.
      .mockResolvedValueOnce(
        scan({
          state: "complete",
          verdict: {
            status: "ready",
            label: "human",
            headline: "Likely real",
            aiLikelihood: 5,
            confidence: 90,
          },
          heatmap: { status: "skipped" },
          analysis: {
            status: "ready",
            agreement: "strong",
            imageTags: [],
            keyIndicators: [],
            reasoning: "",
            recommendations: [],
          },
        }),
      );
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.scan?.state).toBe("partial"));
    expect(clock.pendingCount()).toBe(1);

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(result.current.scan?.state).toBe("complete"));
    expect(clock.pendingCount()).toBe(0);
  });
});

describe("useScan — error handling", () => {
  it("surfaces SCAN_NOT_FOUND as a terminal polling error", async () => {
    const fetchScan = vi.fn().mockRejectedValue(
      new ApiError("SCAN_NOT_FOUND", "That scan isn't available.", false, {
        status: 404,
      }),
    );
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.code).toBe("SCAN_NOT_FOUND");
    expect(clock.pendingCount()).toBe(0);
  });

  it("keeps polling through transient network errors", async () => {
    const networkErr = new ApiError(
      "INTERNAL_ERROR",
      "Network error",
      true,
      { isNetwork: true },
    );
    const fetchScan = vi
      .fn()
      .mockRejectedValueOnce(networkErr)
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce(
        scan({
          state: "complete",
          verdict: {
            status: "ready",
            label: "ai",
            headline: "AI generated",
            aiLikelihood: 91,
            confidence: 91,
          },
        }),
      );
    const { clock, result } = mount(fetchScan);

    // After the first (failed) fetch, a retry is still scheduled.
    await waitFor(() => expect(clock.pendingCount()).toBe(1));
    expect(result.current.error).toBeNull();

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(fetchScan).toHaveBeenCalledTimes(2));
    expect(result.current.error).toBeNull();

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(result.current.scan?.state).toBe("complete"));
    expect(clock.pendingCount()).toBe(0);
  });

  it("keeps polling through transient 5xx errors", async () => {
    const upstreamErr = new ApiError(
      "INTERNAL_ERROR",
      "Upstream hiccup.",
      true,
      { status: 502 },
    );
    const fetchScan = vi
      .fn()
      .mockRejectedValueOnce(upstreamErr)
      .mockResolvedValueOnce(scan({ state: "polling" }));
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(clock.pendingCount()).toBe(1));
    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(result.current.scan?.state).toBe("polling"));
    expect(result.current.error).toBeNull();
  });
});

describe("useScan — SCAN_TIMEOUT ceiling", () => {
  it("synthesizes SCAN_TIMEOUT after 2 minutes of non-terminal polls", async () => {
    // Every poll returns still-polling. The ceiling fires when the
    // elapsed wall-clock time exceeds SCAN_TIMEOUT_MS.
    const fetchScan = vi
      .fn()
      .mockImplementation(async () => scan({ state: "polling" }));
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.scan?.state).toBe("polling"));

    // Fire timers until the hook synthesizes timeout. Each fire
    // advances time by the scheduled delay (2s → 2s → 3s → 4s → 5s…).
    for (let i = 0; i < 40; i++) {
      if (clock.pendingCount() === 0) break;
      await act(async () => {
        await clock.fireNext();
      });
      if (result.current.error) break;
    }

    expect(result.current.error?.code).toBe("SCAN_TIMEOUT");
    expect(clock.pendingCount()).toBe(0);
    expect(clock.now).toBeGreaterThanOrEqual(SCAN_TIMEOUT_MS);
  });
});

describe("useScan — backoff schedule", () => {
  it("uses 2s for the first gap and lands at 5s after a few polls", async () => {
    const fetchScan = vi
      .fn()
      .mockResolvedValue(scan({ state: "polling" }));
    const { clock, result } = mount(fetchScan);

    await waitFor(() => expect(result.current.scan?.state).toBe("polling"));

    // After poll #1, the scheduled delay is POLL_DELAYS_MS[1] = 2s.
    expect(clock.pendingDelays()).toEqual([POLL_DELAYS_MS[1]]);

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(fetchScan).toHaveBeenCalledTimes(2));
    // After poll #2, delay is POLL_DELAYS_MS[2] = 3s.
    expect(clock.pendingDelays()).toEqual([POLL_DELAYS_MS[2]]);

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(fetchScan).toHaveBeenCalledTimes(3));
    expect(clock.pendingDelays()).toEqual([POLL_DELAYS_MS[3]]);

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(fetchScan).toHaveBeenCalledTimes(4));
    // After this and beyond, delay pegs at 5s.
    expect(clock.pendingDelays()).toEqual([5000]);

    await act(async () => {
      await clock.fireNext();
    });
    await waitFor(() => expect(fetchScan).toHaveBeenCalledTimes(5));
    expect(clock.pendingDelays()).toEqual([5000]);
  });
});
