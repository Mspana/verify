// Two-phase quota accounting: reserve at upload-url, commit at submit,
// release on abandon/failure. The reserve/commit split prevents a user
// from slipping multiple parallel uploads past the cap in the race window
// between upload-url and submit.
//
// Stale-reservation sweep lives here as well. A reservation is "stale" if
// it's been sitting > 10 min without an accompanying submit — the 10-min
// threshold is from ERRORS.md's upload-failure policy. Sweeping happens on
// upload-url requests (piggybacking avoids a second cron).

import {
  deleteReservation,
  getQuota,
  getReservation,
  listReservations,
  putQuota,
  putReservation,
  type QuotaRecord,
  type ReservationRecord,
} from "./kv.ts";
import type { Logger } from "./logger.ts";

/** Daily scan cap per anonymous user. Tunable; 10 is MVP per ERRORS.md. */
export const DAILY_QUOTA = 10;

const STALE_RESERVATION_MS = 10 * 60 * 1000;

export type ReserveResult =
  | { ok: true; quota: QuotaRecord }
  | { ok: false; quota: QuotaRecord };

/**
 * Beijing-time (UTC+8) calendar day, formatted YYYY-MM-DD. This is the
 * quota bucket key. Fixed offset, no DST — mainland China doesn't observe
 * DST, so this is stable year-round without a timezone library.
 */
export function beijingDay(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/**
 * ISO timestamp of the next midnight Beijing time. Returned by GET /api/quota
 * so the frontend can render a countdown.
 */
export function beijingDayResetsAt(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  // Next Beijing midnight in UTC terms: truncate the shifted time to its
  // date, add one day, subtract the 8h offset back.
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const nextBjMidnightUtc = Date.UTC(y, m, d + 1, 0, 0, 0) - 8 * 60 * 60 * 1000;
  return new Date(nextBjMidnightUtc).toISOString();
}

/**
 * Attempt to reserve a quota slot for the user. Returns ok=false if the
 * day's reserved+committed would exceed the cap; caller surfaces
 * QUOTA_EXCEEDED in that case without mutating anything.
 */
export async function reserve(
  kv: KVNamespace,
  log: Logger,
  userId: string,
): Promise<ReserveResult> {
  const day = beijingDay();
  const current = await getQuota(kv, userId, day);
  const used = current.reserved + current.committed;
  if (used >= DAILY_QUOTA) {
    log.warn("quota.exceeded", { used, limit: DAILY_QUOTA });
    return { ok: false, quota: current };
  }
  const next: QuotaRecord = {
    reserved: current.reserved + 1,
    committed: current.committed,
  };
  await putQuota(kv, userId, day, next);
  log.info("quota.reserve", {
    reserved: next.reserved,
    committed: next.committed,
    limit: DAILY_QUOTA,
  });
  return { ok: true, quota: next };
}

/**
 * Commit a previously-reserved slot. Called from submit after TruthScan
 * accepts /detect. Moves the accounting unit from `reserved` to `committed`.
 */
export async function commit(
  kv: KVNamespace,
  log: Logger,
  userId: string,
  scanId: string,
): Promise<void> {
  const day = beijingDay();
  const current = await getQuota(kv, userId, day);
  // If somehow there's no reservation to move (reservation TTL expired,
  // or we're commiting against a day boundary), still record the commit —
  // the user successfully started a scan, that has to count.
  const reserved = Math.max(0, current.reserved - 1);
  const next: QuotaRecord = {
    reserved,
    committed: current.committed + 1,
  };
  await putQuota(kv, userId, day, next);
  await deleteReservation(kv, userId, scanId);
  log.info("quota.commit", {
    reserved: next.reserved,
    committed: next.committed,
  });
}

/**
 * Release a reservation without committing. Called when upload or submit
 * fails after a reservation but before commit; also used by the stale sweep.
 */
export async function release(
  kv: KVNamespace,
  log: Logger,
  userId: string,
  scanId: string,
  reason: "abandoned" | "failed",
): Promise<void> {
  const day = beijingDay();
  const current = await getQuota(kv, userId, day);
  const next: QuotaRecord = {
    reserved: Math.max(0, current.reserved - 1),
    committed: current.committed,
  };
  await putQuota(kv, userId, day, next);
  await deleteReservation(kv, userId, scanId);
  log.info("quota.release", { scanId, reason });
}

/**
 * Record a reservation keyed by scanId so we can identify and sweep stale
 * ones. Called from upload-url alongside `reserve`.
 */
export async function recordReservation(
  kv: KVNamespace,
  userId: string,
  scanId: string,
): Promise<ReservationRecord> {
  const rec: ReservationRecord = {
    scanId,
    userId,
    createdAt: new Date().toISOString(),
  };
  await putReservation(kv, userId, rec);
  return rec;
}

/**
 * Reservations older than 10 min with no matching commit are released.
 * Piggybacks on upload-url so we avoid a dedicated cron; the per-user
 * surface means each call only touches O(active-reservations-for-this-user)
 * keys, which is bounded by DAILY_QUOTA.
 */
export async function sweepStaleReservations(
  kv: KVNamespace,
  log: Logger,
  userId: string,
): Promise<void> {
  const all = await listReservations(kv, userId);
  const now = Date.now();
  for (const r of all) {
    const age = now - Date.parse(r.createdAt);
    if (age > STALE_RESERVATION_MS) {
      await release(kv, log, userId, r.scanId, "abandoned");
    }
  }
}

/** Ownership check — does this user have an active reservation for this scan? */
export async function hasReservation(
  kv: KVNamespace,
  userId: string,
  scanId: string,
): Promise<boolean> {
  const rec = await getReservation(kv, userId, scanId);
  return rec !== null;
}
