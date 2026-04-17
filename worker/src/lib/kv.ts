// KV storage layer. Encapsulates every key pattern from ARCHITECTURE.md's
// storage section so callers never concatenate strings. Any new key format
// gets added here, not elsewhere.
//
// Key patterns:
//   user:<userId>
//   scan:<scanId>
//   idx:scans:<userId>:<ts-desc>:<scanId>
//   idx:trash:<userId>:<ts-desc>:<scanId>
//   quota:<userId>:<YYYY-MM-DD>
//   reservation:<userId>:<scanId>       (internal — see quota.ts)

import type { Scan } from "@verify/shared";

// === Internal record shapes ===
//
// These are KV-only shapes (no cross-boundary representation in shared/).
// ScanRecord extends the public Scan with fields the Worker needs for
// lifecycle bookkeeping: who owns it, what TruthScan said about the upload
// step, and when it transitioned state.

export type UserRecord = {
  createdAt: string;
  lastSeenAt: string;
  scanCount: number;
};

export type ScanRecord = Scan & {
  userId: string;
  /** Path returned by TruthScan's /get-presigned-url — used to call /detect. */
  filePath: string;
  /**
   * TruthScan's id for this scan, returned by their /detect response. Null
   * until submit completes. Used for every subsequent /query, /preview, and
   * /heatmap call against TruthScan — our own scanId isn't valid there
   * because TruthScan assigns a document_id at /get-presigned-url time and
   * rejects /detect calls whose `id` already exists in their system.
   */
  truthscanId: string | null;
  /** When /detect was accepted. Separate from createdAt to cleanly measure
   *  submit→verdict duration for the scan.complete log event. */
  submittedAt: string | null;
  /** Populated once we've seen a terminal verdict, used to emit durationMs
   *  exactly once on the transition (and not on every subsequent poll). */
  completedAt: string | null;
  /** Soft-delete marker; presence moves the scan from scans index to trash. */
  deletedAt: string | null;
};

export type QuotaRecord = {
  reserved: number;
  committed: number;
};

export type ReservationRecord = {
  scanId: string;
  userId: string;
  createdAt: string;
};

// === Key builders ===
//
// Exported only so tests can assert key shapes. Handlers should use the
// typed helpers below, not these.

export const keys = {
  user: (userId: string) => `user:${userId}`,
  scan: (scanId: string) => `scan:${scanId}`,
  idxScans: (userId: string, createdAt: string, scanId: string) =>
    `idx:scans:${userId}:${toDescTs(createdAt)}:${scanId}`,
  idxScansPrefix: (userId: string) => `idx:scans:${userId}:`,
  idxTrash: (userId: string, createdAt: string, scanId: string) =>
    `idx:trash:${userId}:${toDescTs(createdAt)}:${scanId}`,
  idxTrashPrefix: (userId: string) => `idx:trash:${userId}:`,
  idxTrashGlobalPrefix: () => `idx:trash:`,
  quota: (userId: string, day: string) => `quota:${userId}:${day}`,
  reservation: (userId: string, scanId: string) =>
    `reservation:${userId}:${scanId}`,
  reservationPrefix: (userId: string) => `reservation:${userId}:`,
} as const;

// Reverse-timestamp sort key so KV's lexicographic prefix list returns
// newest-first without paging to the end. 13 digits = ms since epoch max,
// comfortably out past year 5138.
const TS_DESC_CEILING = 9_999_999_999_999;

export function toDescTs(isoTimestamp: string): string {
  const ms = Date.parse(isoTimestamp);
  // Invalid → sort to the end of the list. Defensive; callers should pass
  // valid ISO timestamps.
  if (Number.isNaN(ms)) return String(TS_DESC_CEILING).padStart(13, "0");
  const desc = TS_DESC_CEILING - ms;
  return String(desc).padStart(13, "0");
}

// === Typed helpers ===

export async function getUser(
  kv: KVNamespace,
  userId: string,
): Promise<UserRecord | null> {
  return kv.get<UserRecord>(keys.user(userId), "json");
}

export async function putUser(
  kv: KVNamespace,
  userId: string,
  record: UserRecord,
): Promise<void> {
  await kv.put(keys.user(userId), JSON.stringify(record));
}

export async function getScan(
  kv: KVNamespace,
  scanId: string,
): Promise<ScanRecord | null> {
  return kv.get<ScanRecord>(keys.scan(scanId), "json");
}

export async function putScan(
  kv: KVNamespace,
  record: ScanRecord,
): Promise<void> {
  await kv.put(keys.scan(record.id), JSON.stringify(record));
}

export async function deleteScanRecord(
  kv: KVNamespace,
  scanId: string,
): Promise<void> {
  await kv.delete(keys.scan(scanId));
}

export async function putScansIndex(
  kv: KVNamespace,
  userId: string,
  scan: ScanRecord,
): Promise<void> {
  await kv.put(keys.idxScans(userId, scan.createdAt, scan.id), "");
}

export async function deleteScansIndex(
  kv: KVNamespace,
  userId: string,
  scan: ScanRecord,
): Promise<void> {
  await kv.delete(keys.idxScans(userId, scan.createdAt, scan.id));
}

export async function putTrashIndex(
  kv: KVNamespace,
  userId: string,
  scan: ScanRecord,
): Promise<void> {
  await kv.put(keys.idxTrash(userId, scan.createdAt, scan.id), "");
}

export async function deleteTrashIndex(
  kv: KVNamespace,
  userId: string,
  scan: ScanRecord,
): Promise<void> {
  await kv.delete(keys.idxTrash(userId, scan.createdAt, scan.id));
}

export type ListedScanKey = {
  scanId: string;
  createdAt: string; // derived from desc-ts in the key
  cursorKey: string;
};

/**
 * List scan-index keys for a user. Returns parsed scanIds and the original
 * key (used as cursor for pagination). Cursor is KV's own list cursor,
 * not a scanId — opaque to callers.
 */
export async function listScansIndex(
  kv: KVNamespace,
  userId: string,
  kind: "active" | "trash",
  limit: number,
  cursor?: string,
): Promise<{ keys: ListedScanKey[]; nextCursor?: string }> {
  const prefix =
    kind === "active"
      ? keys.idxScansPrefix(userId)
      : keys.idxTrashPrefix(userId);
  const res = await kv.list({ prefix, limit, cursor });
  const parsed: ListedScanKey[] = [];
  for (const k of res.keys) {
    const p = parseIndexKey(k.name);
    if (p) parsed.push({ ...p, cursorKey: k.name });
  }
  // Cloudflare's list_complete flag is authoritative for "more?"; cursor
  // may still be set on the final page of some API versions.
  const nextCursor = res.list_complete ? undefined : res.cursor;
  return { keys: parsed, nextCursor };
}

/**
 * Global trash list — used by the daily purge cron, which doesn't know
 * userIds in advance.
 */
export async function listAllTrash(
  kv: KVNamespace,
  cursor?: string,
): Promise<{
  keys: { userId: string; scanId: string; createdAt: string; key: string }[];
  nextCursor?: string;
}> {
  const res = await kv.list({
    prefix: keys.idxTrashGlobalPrefix(),
    cursor,
    limit: 1000,
  });
  const out: {
    userId: string;
    scanId: string;
    createdAt: string;
    key: string;
  }[] = [];
  for (const k of res.keys) {
    const p = parseTrashGlobalKey(k.name);
    if (p) out.push({ ...p, key: k.name });
  }
  const nextCursor = res.list_complete ? undefined : res.cursor;
  return { keys: out, nextCursor };
}

function parseIndexKey(
  name: string,
): { scanId: string; createdAt: string } | null {
  // idx:scans:<userId>:<ts-desc>:<scanId>
  // idx:trash:<userId>:<ts-desc>:<scanId>
  const parts = name.split(":");
  if (parts.length !== 5) return null;
  const tsDesc = parts[3];
  const scanId = parts[4];
  if (!tsDesc || !scanId) return null;
  const ms = TS_DESC_CEILING - Number(tsDesc);
  if (!Number.isFinite(ms)) return null;
  return { scanId, createdAt: new Date(ms).toISOString() };
}

function parseTrashGlobalKey(
  name: string,
): { userId: string; scanId: string; createdAt: string } | null {
  const parts = name.split(":");
  if (parts.length !== 5 || parts[0] !== "idx" || parts[1] !== "trash") {
    return null;
  }
  const userId = parts[2];
  const tsDesc = parts[3];
  const scanId = parts[4];
  if (!userId || !tsDesc || !scanId) return null;
  const ms = TS_DESC_CEILING - Number(tsDesc);
  if (!Number.isFinite(ms)) return null;
  return { userId, scanId, createdAt: new Date(ms).toISOString() };
}

// === Quota + reservation helpers ===
//
// Mutations go through quota.ts; these are thin read/write primitives.

export async function getQuota(
  kv: KVNamespace,
  userId: string,
  day: string,
): Promise<QuotaRecord> {
  const rec = await kv.get<QuotaRecord>(keys.quota(userId, day), "json");
  return rec ?? { reserved: 0, committed: 0 };
}

export async function putQuota(
  kv: KVNamespace,
  userId: string,
  day: string,
  record: QuotaRecord,
): Promise<void> {
  // 48h TTL — covers same-day reads plus enough slack for the
  // midnight-Beijing reset boundary without needing a manual sweep.
  await kv.put(keys.quota(userId, day), JSON.stringify(record), {
    expirationTtl: 60 * 60 * 48,
  });
}

export async function putReservation(
  kv: KVNamespace,
  userId: string,
  rec: ReservationRecord,
): Promise<void> {
  // 30 min TTL — belt-and-suspenders around the 10-min "stale" sweep, so
  // even if a user abandons between upload-url and submit, KV reaps it.
  await kv.put(
    keys.reservation(userId, rec.scanId),
    JSON.stringify(rec),
    { expirationTtl: 60 * 30 },
  );
}

export async function getReservation(
  kv: KVNamespace,
  userId: string,
  scanId: string,
): Promise<ReservationRecord | null> {
  return kv.get<ReservationRecord>(keys.reservation(userId, scanId), "json");
}

export async function deleteReservation(
  kv: KVNamespace,
  userId: string,
  scanId: string,
): Promise<void> {
  await kv.delete(keys.reservation(userId, scanId));
}

export async function listReservations(
  kv: KVNamespace,
  userId: string,
): Promise<ReservationRecord[]> {
  const res = await kv.list({ prefix: keys.reservationPrefix(userId) });
  const out: ReservationRecord[] = [];
  // KV list returns keys only; we need values (createdAt) to judge staleness.
  await Promise.all(
    res.keys.map(async (k) => {
      const v = await kv.get<ReservationRecord>(k.name, "json");
      if (v) out.push(v);
    }),
  );
  return out;
}
