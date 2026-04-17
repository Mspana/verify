// POST /api/session — explicit session issue endpoint.
//
// The session middleware already mints a cookie for any /api/* request
// without one, so this endpoint is idempotent: whether the caller has a
// cookie or not, they get a valid userId back in the body (and a Set-Cookie
// if a new session was minted). Useful for the frontend to call on first
// load before it knows anything else.

import { Hono } from "hono";
import type { SessionResponse } from "@verify/shared";
import type { HonoEnv } from "../types.ts";
import { getUser, putUser } from "../lib/kv.ts";

export const sessionRoutes = new Hono<HonoEnv>();

sessionRoutes.post("/session", async (c) => {
  const userId = c.get("userId");
  const log = c.get("log");

  // Touch lastSeenAt — useful diagnostic for "when did this user last hit
  // the app?" without needing full request logs.
  const now = new Date().toISOString();
  const existing = await getUser(c.env.VERIFY_KV, userId);
  if (existing) {
    await putUser(c.env.VERIFY_KV, userId, {
      ...existing,
      lastSeenAt: now,
    });
  } else {
    // Middleware wrote the stub already on session issue; this branch is
    // mostly defensive for the case where the user record was purged.
    await putUser(c.env.VERIFY_KV, userId, {
      createdAt: now,
      lastSeenAt: now,
      scanCount: 0,
    });
    log.info("session.issue", {});
  }

  const body: SessionResponse = { userId };
  return c.json(body);
});
