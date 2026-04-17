// Cross-handler types for the Hono router: environment bindings (KV +
// secrets) and the per-request context variables that middleware attaches
// to `c.get(...)`. Kept separate so handlers don't have to re-declare.

import type { ErrorCode, ScanError } from "@verify/shared";

import type { Logger } from "./lib/logger.ts";

export type Env = {
  VERIFY_KV: KVNamespace;
  TRUTHSCAN_API_KEY: string;
  COOKIE_SIGNING_KEY: string;
  /**
   * Optional override. Unset in production/staging; set in dev or tests to
   * point at a mock server.
   */
  TRUTHSCAN_API_BASE?: string;
};

/** Attached by middleware; every handler can read these. */
export type RequestVars = {
  requestId: string;
  userId: string;
  log: Logger;
  /** Fresh Set-Cookie header when the session was newly minted on this
   *  request. Router appends it to the response automatically. */
  setCookie?: string;
};

export type HonoEnv = {
  Bindings: Env;
  Variables: RequestVars;
};

/**
 * Build a typed error response body. Using the shared ScanError shape here
 * turns every `code` into a compile-time enum check — a typo or a new
 * unregistered code fails typecheck rather than shipping as a string.
 */
export function err(
  code: ErrorCode,
  message: string,
  retryable: boolean,
): ScanError {
  return { code, message, retryable };
}
