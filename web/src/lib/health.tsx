import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { getHealth } from "./api";

// Health probe lives in a Context so the upstream-down banner (mounted
// in AppShell) and the Scan button (mounted deep inside HomePage) read
// the same state without prop-drilling.
//
// Semantics (per ERRORS.md and the step 7 spec):
// - Initial `healthy` defaults to true → no degraded-banner flash on
//   first paint before the first probe resolves.
// - Single probe fail → banner shows; single probe succeed → banner
//   clears. No multi-probe smoothing (that's OBSERVABILITY.md territory).
// - `lastChecked` so consumers can show a subtle stale-state hint if
//   wall-clock time has jumped (tab slept) and the probe hasn't rerun.

const HEALTH_POLL_MS = 60_000;

export type Health = {
  healthy: boolean;
  lastChecked: Date | null;
};

const HealthContext = createContext<Health | null>(null);

export function HealthProvider({ children }: { children: ReactNode }) {
  const [healthy, setHealthy] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const probe = () => {
      getHealth()
        .then(() => {
          if (cancelled) return;
          setHealthy(true);
          setLastChecked(new Date());
        })
        .catch(() => {
          if (cancelled) return;
          setHealthy(false);
          setLastChecked(new Date());
        });
    };
    probe();
    const id = window.setInterval(probe, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <HealthContext.Provider value={{ healthy, lastChecked }}>
      {children}
    </HealthContext.Provider>
  );
}

/**
 * Read the current health state. Must be called inside a <HealthProvider>,
 * which AppShell mounts at the root. Default value of `true` outside the
 * provider would silently mask missing plumbing — we throw instead.
 */
export function useHealth(): Health {
  const ctx = useContext(HealthContext);
  if (!ctx) {
    throw new Error(
      "useHealth must be used inside <HealthProvider>. Mount it in AppShell.",
    );
  }
  return ctx;
}
