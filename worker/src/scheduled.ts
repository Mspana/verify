// Daily purge cron. Scans the global trash index (idx:trash:*), parses the
// embedded ts-desc, and deletes any trashed entry whose deletedAt is past
// the 30-day retention window. Both the index entry and the scan record
// are removed.
//
// Runs at 04:00 UTC = noon Beijing per wrangler.toml — avoids the
// midnight-UTC cron rush and keeps daylight hours in-region for an operator
// to investigate on failure.

import { deleteScanRecord, getScan, listAllTrash } from "./lib/kv.ts";
import { createLogger } from "./lib/logger.ts";
import type { Env } from "./types.ts";

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export async function runPurge(env: Env): Promise<void> {
  const requestId = crypto.randomUUID();
  const log = createLogger({ requestId });
  const started = Date.now();
  let examined = 0;
  let purged = 0;
  let cursor: string | undefined = undefined;

  try {
    // Page through every trash entry in KV. The global prefix is
    // `idx:trash:` — userId is embedded in the key, so this one scan
    // handles all users.
    do {
      const page = await listAllTrash(env.VERIFY_KV, cursor);
      for (const entry of page.keys) {
        examined++;
        const record = await getScan(env.VERIFY_KV, entry.scanId);
        if (!record) {
          // Record already gone (edge case: crash mid-delete); still clear
          // the dangling index entry.
          await env.VERIFY_KV.delete(entry.key);
          purged++;
          continue;
        }
        const deletedAt = record.deletedAt
          ? Date.parse(record.deletedAt)
          : null;
        if (deletedAt === null) {
          // In trash index but no deletedAt — inconsistency. Remove the
          // index entry so the trash view stops showing it, but keep the
          // record (it may still be referenced from the active index).
          await env.VERIFY_KV.delete(entry.key);
          continue;
        }
        const age = Date.now() - deletedAt;
        if (age > RETENTION_MS) {
          await deleteScanRecord(env.VERIFY_KV, entry.scanId);
          await env.VERIFY_KV.delete(entry.key);
          purged++;
        }
      }
      cursor = page.nextCursor;
    } while (cursor);

    log.info("purge.run", {
      nExamined: examined,
      nPurged: purged,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("purge.error", { errorCode: "PURGE_FAILED", message: msg });
  }
}

