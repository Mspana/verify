// Structured JSON logger matching OBSERVABILITY.md's event shapes.
//
// Every log line is one JSON object on one line; `console.log` is the
// transport (wrangler tail and Logpush both work with this). All logs go
// through this module so that required fields (ts, level, event, requestId)
// are always present and cardinality discipline stays intact.

export type LogLevel = "debug" | "info" | "warn" | "error";

// Event names are namespaced and low-cardinality — they're aggregated, so
// typing them as a union makes misuse visible in the editor.
export type LogEvent =
  | "req.start"
  | "req.end"
  | "session.issue"
  | "session.invalid"
  | "scan.upload_url"
  | "scan.submit"
  | "scan.poll"
  | "scan.complete"
  | "scan.failed"
  | "scan.deleted"
  | "scan.restored"
  | "truthscan.call"
  | "truthscan.error"
  | "truthscan.timeout"
  | "truthscan.retry"
  | "quota.reserve"
  | "quota.commit"
  | "quota.release"
  | "quota.exceeded"
  | "asset.serve"
  | "asset.unavailable"
  | "purge.run"
  | "purge.error"
  | "normalize.unknown_verdict"
  | "normalize.unknown_agreement"
  | "internal.error";

export type LogFields = Record<string, unknown>;

export type Logger = {
  /** Child logger with fields merged into every emitted line. */
  with(fields: LogFields): Logger;
  debug(event: LogEvent, fields?: LogFields): void;
  info(event: LogEvent, fields?: LogFields): void;
  warn(event: LogEvent, fields?: LogFields): void;
  error(event: LogEvent, fields?: LogFields): void;
};

type RequiredBase = {
  requestId: string;
  userId?: string;
};

// Fields we refuse to let callers emit — they're either secrets or
// cardinality bombs. Worth enforcing here rather than relying on reviewers.
const FORBIDDEN_FIELDS = new Set([
  "apiKey",
  "api_key",
  "cookie",
  "signingKey",
  "Authorization",
  "authorization",
  "filename",
]);

function redact(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (FORBIDDEN_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function emit(
  level: LogLevel,
  event: LogEvent,
  base: RequiredBase,
  extra: LogFields,
): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    ...base,
    ...redact(extra),
  };
  // One line, one event. console.error/warn in Workers still end up in the
  // same stream, but using them preserves the level for Cloudflare's own UI.
  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export function createLogger(base: RequiredBase): Logger {
  return {
    with(fields: LogFields): Logger {
      const merged: RequiredBase = { ...base };
      if (typeof fields.userId === "string") merged.userId = fields.userId;
      const rest = { ...fields };
      delete rest.userId;
      // Merged child loggers carry the extra fields on every emit.
      return wrapChild(merged, rest);
    },
    debug(event, fields) {
      emit("debug", event, base, fields ?? {});
    },
    info(event, fields) {
      emit("info", event, base, fields ?? {});
    },
    warn(event, fields) {
      emit("warn", event, base, fields ?? {});
    },
    error(event, fields) {
      emit("error", event, base, fields ?? {});
    },
  };
}

function wrapChild(base: RequiredBase, extra: LogFields): Logger {
  return {
    with(fields: LogFields): Logger {
      const nextBase: RequiredBase = { ...base };
      if (typeof fields.userId === "string") nextBase.userId = fields.userId;
      const rest = { ...fields };
      delete rest.userId;
      return wrapChild(nextBase, { ...extra, ...rest });
    },
    debug(event, fields) {
      emit("debug", event, base, { ...extra, ...(fields ?? {}) });
    },
    info(event, fields) {
      emit("info", event, base, { ...extra, ...(fields ?? {}) });
    },
    warn(event, fields) {
      emit("warn", event, base, { ...extra, ...(fields ?? {}) });
    },
    error(event, fields) {
      emit("error", event, base, { ...extra, ...(fields ?? {}) });
    },
  };
}
