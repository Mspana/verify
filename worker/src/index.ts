// Worker entry. Thin router only — all business logic lives in handlers/.
//
// Middleware chain (in order):
//   1. requestId          — crypto.randomUUID() per request; attached to
//                           every downstream log line for correlation.
//   2. logger             — structured JSON via lib/logger.ts.
//   3. session            — cookie verify or mint; sets userId on context;
//                           queues a Set-Cookie for the response if new.
//   4. req.start / req.end — router-level timing. Emitted around each
//                           /api/* request.
//
// The scheduled export wires the daily purge cron defined in wrangler.toml.

import { Hono } from "hono";

import { assetRoutes } from "./handlers/assets.ts";
import { historyRoutes } from "./handlers/history.ts";
import { metaRoutes } from "./handlers/meta.ts";
import { scanRoutes } from "./handlers/scan.ts";
import { sessionRoutes } from "./handlers/session.ts";
import {
  importSigningKey,
  mintSession,
  refreshCookie,
  verifyCookie,
} from "./lib/cookie.ts";
import { putUser } from "./lib/kv.ts";
import { createLogger } from "./lib/logger.ts";
import { runPurge } from "./scheduled.ts";
import { err, type Env, type HonoEnv } from "./types.ts";

const app = new Hono<HonoEnv>();

// === 1. requestId + logger ===
app.use("/api/*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.set("log", createLogger({ requestId }));
  await next();
});

// === 2. session ===
// Cookie verify → userId on context. Missing/invalid cookie → fresh session
// minted here (silent reissue per ERRORS.md SESSION_INVALID). A new Set-Cookie
// header is queued on the response via c.set("setCookie", ...).
app.use("/api/*", async (c, next) => {
  const log = c.get("log");
  const signingKey = await importSigningKey(c.env.COOKIE_SIGNING_KEY);
  const cookieHeader = c.req.header("Cookie") ?? null;
  const verified = await verifyCookie(signingKey, cookieHeader);

  // Only flag `Secure` outside local dev; wrangler dev runs on http://.
  // We infer from the request URL rather than env to avoid a flag flip.
  const secure = new URL(c.req.url).protocol === "https:";

  if (verified.ok) {
    c.set("userId", verified.userId);
    // Refresh Max-Age so active sessions stay alive.
    c.set("setCookie", await refreshCookie(signingKey, verified.userId, secure));
  } else {
    if (verified.reason === "bad_signature" || verified.reason === "malformed") {
      log.warn("session.invalid", { cookiePresent: true });
    }
    const issued = await mintSession(signingKey, secure);
    c.set("userId", issued.userId);
    c.set("setCookie", issued.setCookieHeader);
    // Persist a user stub. Cookie issue and KV stub write go together.
    const now = new Date().toISOString();
    await putUser(c.env.VERIFY_KV, issued.userId, {
      createdAt: now,
      lastSeenAt: now,
      scanCount: 0,
    });
    c.get("log").info("session.issue", { userId: issued.userId });
  }

  // Attach userId to the logger from here on — child logger carries it to
  // every downstream emit without handlers having to remember.
  c.set("log", c.get("log").with({ userId: c.get("userId") }));

  await next();

  // Tack Set-Cookie onto the response on the way out. Hono's c.header()
  // call post-next still applies to the outgoing response.
  const set = c.get("setCookie");
  if (set) c.header("Set-Cookie", set, { append: true });
});

// === 3. req.start / req.end ===
app.use("/api/*", async (c, next) => {
  const log = c.get("log");
  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  const started = Date.now();
  log.info("req.start", { method, path });
  try {
    await next();
  } finally {
    log.info("req.end", {
      method,
      path,
      status: c.res.status,
      durationMs: Date.now() - started,
    });
  }
});

// === Route mounts ===
app.route("/api", sessionRoutes);
app.route("/api", scanRoutes);
app.route("/api", assetRoutes);
app.route("/api", historyRoutes);
app.route("/api", metaRoutes);

// Unknown /api/* → 404 with our standard error shape. Non-/api paths fall
// through to the Static Assets binding, which serves web/dist (SPA fallback
// returns index.html for unknown routes so React Router handles them).
app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json(err("SCAN_NOT_FOUND", "Not found.", false), 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((caught, c) => {
  // Last-resort handler. If we reach here an unhandled exception escaped
  // a handler — log with the requestId so we can reconstruct the timeline.
  const log = c.get("log");
  const msg = caught instanceof Error ? caught.message : String(caught);
  (log ?? createLogger({ requestId: "unknown" })).error("internal.error", {
    message: msg,
  });
  return c.json(
    err("INTERNAL_ERROR", "Something went wrong. Please try again.", true),
    500,
  );
});

export default {
  fetch: app.fetch,
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Cron work must survive the scheduled-event lifecycle — waitUntil lets
    // KV writes complete even if the event returns first.
    ctx.waitUntil(runPurge(env));
  },
};
