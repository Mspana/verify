// Cross-cutting rate-limit notifier. api.ts dispatches here when it
// sees a 429; AppShell subscribes and shows the amber banner. Singleton
// EventTarget is the lightest decoupling that keeps React out of the
// API layer — no Context shim crossing the module boundary, no
// repetitive try/catch at every call site.
//
// Banner behavior (owned by the subscriber, not this module):
// - Show on event
// - Auto-dismiss 30s after the most-recent event (reset on new events)
// - Cap at 5 minutes total banner lifetime; after that, force-dismiss
//   even if events keep firing (they'd start a fresh banner on the
//   next event after the forced dismiss)
//
// We export constants so the AppShell subscriber doesn't hardcode them.

export const RATE_LIMIT_EVENT = "rate-limited";
export const RATE_LIMIT_DISMISS_MS = 30_000;
export const RATE_LIMIT_MAX_LIFETIME_MS = 5 * 60_000;

const bus = new EventTarget();

/** Called by api.ts on every 429 response. */
export function notifyRateLimit(): void {
  bus.dispatchEvent(new Event(RATE_LIMIT_EVENT));
}

/** Subscribe to rate-limit events. Returns an unsubscribe function. */
export function onRateLimit(handler: () => void): () => void {
  bus.addEventListener(RATE_LIMIT_EVENT, handler);
  return () => bus.removeEventListener(RATE_LIMIT_EVENT, handler);
}
