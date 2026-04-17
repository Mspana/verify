// GET /api/scans — list the user's scans, newest first. Paged via the KV
// list cursor, which is opaque to the client; we pass it through in
// nextCursor. `?deleted=true` switches to the trash view.

import { Hono } from "hono";
import type { Scan, ScanListResponse } from "@verify/shared";

import type { HonoEnv } from "../types.ts";
import { getScan, listScansIndex } from "../lib/kv.ts";
import { publicScan } from "./scan.ts";

export const historyRoutes = new Hono<HonoEnv>();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

historyRoutes.get("/scans", async (c) => {
  const userId = c.get("userId");
  const deleted = c.req.query("deleted") === "true";
  const rawLimit = Number(c.req.query("limit") ?? DEFAULT_LIMIT);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;
  const cursor = c.req.query("cursor") || undefined;

  const { keys, nextCursor } = await listScansIndex(
    c.env.VERIFY_KV,
    userId,
    deleted ? "trash" : "active",
    limit,
    cursor,
  );

  // Batch-fetch records. KV doesn't support multi-get so these are
  // concurrent gets — bounded by `limit` which is ≤100.
  const records = await Promise.all(
    keys.map((k) => getScan(c.env.VERIFY_KV, k.scanId)),
  );
  const scans: Scan[] = [];
  for (const rec of records) {
    if (!rec) continue;
    if (rec.userId !== userId) continue; // defensive; index should guarantee
    scans.push(publicScan(rec));
  }

  const response: ScanListResponse = { scans };
  if (nextCursor) response.nextCursor = nextCursor;
  return c.json(response);
});
