// GET /api/quota and GET /api/health
//
// Quota is read-only; it sums reserved + committed for the user's current
// Beijing-time day. Health proxies TruthScan's /health, combining our own
// up-ness ("we responded") with theirs.

import { Hono } from "hono";
import type { QuotaResponse } from "@verify/shared";

import type { HonoEnv } from "../types.ts";
import { getQuota } from "../lib/kv.ts";
import {
  beijingDay,
  beijingDayResetsAt,
  DAILY_QUOTA,
} from "../lib/quota.ts";
import { TruthscanClient } from "../lib/truthscan.ts";

export const metaRoutes = new Hono<HonoEnv>();

metaRoutes.get("/quota", async (c) => {
  const userId = c.get("userId");
  const day = beijingDay();
  const q = await getQuota(c.env.VERIFY_KV, userId, day);
  const response: QuotaResponse = {
    used: q.reserved + q.committed,
    limit: DAILY_QUOTA,
    resetsAt: beijingDayResetsAt(),
  };
  return c.json(response);
});

metaRoutes.get("/health", async (c) => {
  const log = c.get("log");
  const ts = new TruthscanClient(c.env.TRUTHSCAN_API_KEY, {
    apiBase: c.env.TRUTHSCAN_API_BASE,
  });
  const upstream = await ts.health(log);
  if (!upstream.ok) {
    return c.json(
      {
        status: "degraded",
        worker: "ok",
        truthscan: "down",
      },
      503,
    );
  }
  return c.json({
    status: "ok",
    worker: "ok",
    truthscan: upstream.value.status,
  });
});
