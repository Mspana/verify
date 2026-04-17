// Anonymous session cookie: <userId>.<hmac-sha256(userId)>
//
// The signing step uses Web Crypto's HMAC; verification uses
// crypto.subtle.verify, which is constant-time by construction. Naive `===`
// on the signature would leak timing and is flagged in OBSERVABILITY.md as
// something that matters. Do not change the compare to a string equality
// without reading that note.

const COOKIE_NAME = "vfy_uid";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export type CookieVerification =
  | { ok: true; userId: string }
  | { ok: false; reason: "missing" | "malformed" | "bad_signature" };

export type CookieIssued = {
  userId: string;
  setCookieHeader: string;
};

export async function importSigningKey(raw: string): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(raw);
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signUserId(
  key: CryptoKey,
  userId: string,
): Promise<string> {
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(userId),
  );
  return bytesToB64Url(new Uint8Array(sig));
}

/**
 * Verify a cookie value. Signature comparison is constant-time via
 * crypto.subtle.verify. A malformed cookie (wrong structure) is NOT a
 * bad_signature — we want logs to distinguish "client sent garbage" from
 * "client tried a forged signature."
 */
export async function verifyCookie(
  key: CryptoKey,
  cookieHeader: string | null,
): Promise<CookieVerification> {
  const raw = readCookie(cookieHeader, COOKIE_NAME);
  if (!raw) return { ok: false, reason: "missing" };

  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) {
    return { ok: false, reason: "malformed" };
  }
  const userId = raw.slice(0, dot);
  const sigB64 = raw.slice(dot + 1);
  if (!isUuid(userId)) return { ok: false, reason: "malformed" };

  const sig = b64UrlToBytes(sigB64);
  if (!sig) return { ok: false, reason: "malformed" };

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    sig,
    new TextEncoder().encode(userId),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };
  return { ok: true, userId };
}

export async function issueCookie(
  key: CryptoKey,
  userId: string,
  secure: boolean,
): Promise<CookieIssued> {
  const sig = await signUserId(key, userId);
  const value = `${userId}.${sig}`;
  const attrs = [
    `${COOKIE_NAME}=${value}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  // Local dev runs on http://; omitting Secure is the only way cookies work.
  if (secure) attrs.push("Secure");
  return { userId, setCookieHeader: attrs.join("; ") };
}

/**
 * Generate a fresh userId and issue a cookie for it. Pulled out so callers
 * don't have to remember to use crypto.randomUUID() alongside issueCookie.
 */
export async function mintSession(
  key: CryptoKey,
  secure: boolean,
): Promise<CookieIssued> {
  return issueCookie(key, crypto.randomUUID(), secure);
}

/**
 * Refresh an existing session — same userId, new Max-Age. Used on every
 * valid request so active sessions don't expire on their 1-year mark.
 */
export async function refreshCookie(
  key: CryptoKey,
  userId: string,
  secure: boolean,
): Promise<string> {
  return (await issueCookie(key, userId, secure)).setCookieHeader;
}

// === Cookie header parsing ===

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  // Cookie header syntax is "k=v; k=v". No need for a full RFC-grade parser —
  // our cookies don't contain semicolons, spaces, or quotes.
  const parts = header.split(";");
  for (const p of parts) {
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim();
    if (k === name) return p.slice(eq + 1).trim();
  }
  return null;
}

// === base64url (no padding) ===
//
// Cookie values can't carry `+`, `/`, or `=` without encoding, so we use
// base64url and strip padding. Both ends of the signature go through these,
// so they must round-trip exactly.

function bytesToB64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(s: string): Uint8Array | null {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

// === UUID shape check ===
//
// Cheap defensive gate: reject cookies whose userId portion isn't a UUID
// before we bother running HMAC verify. Prevents attacker-controlled strings
// from ever becoming a KV lookup key.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
