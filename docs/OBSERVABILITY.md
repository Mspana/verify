# Observability

> What we log, what we measure, what alerts fire, and how we debug a scan that went sideways.

Companion to `ARCHITECTURE.md` and `ERRORS.md`. MVP-scale: lean, Cloudflare-native, zero third-party tools.

---

## Table of contents

1. [Principles](#principles)
2. [Log structure](#log-structure)
3. [What we log](#what-we-log)
4. [What we never log](#what-we-never-log)
5. [Metrics](#metrics)
6. [Alerts](#alerts)
7. [Debugging a scan](#debugging-a-scan)
8. [Correlation IDs](#correlation-ids)
9. [Retention](#retention)
10. [Future-state upgrades](#future-state-upgrades)

---

## Principles

1. **Every log line is a structured JSON object.** No freeform text. This way `wrangler tail` grep and Logpush both work without parsing.
2. **One event, one line.** Avoid multi-line logs; they break tail and make correlation hard.
3. **Log at the decision, not the state.** "Quota check failed for user X" is useful. "Quota is 7 for user X" before every check is noise.
4. **Cardinality discipline.** No user-controlled strings in fields we'd want to aggregate (filenames, user agents as indices). Bucket or hash first.
5. **Bias to under-logging.** Cloudflare logs cost money past free tier. We'd rather be surprised and add a log than drown in noise.

---

## Log structure

Every log line is a JSON object written via `console.log(JSON.stringify({...}))` in the Worker.

### Required fields

| Field | Type | Example | Notes |
|---|---|---|---|
| `ts` | ISO 8601 | `"2026-04-16T14:22:00.123Z"` | Workers add this automatically; include anyway for portability |
| `level` | string | `"info" \| "warn" \| "error"` | |
| `event` | string | `"scan.submit"` | Namespaced action name — low cardinality |
| `requestId` | uuid | `"a1b2..."` | Generated at Worker entry, passed through the request lifecycle |
| `userId` | uuid | `"c3d4..."` | The signed-cookie userId. Anonymous but stable. |

### Event-specific fields

Each event adds its own. Examples:

```json
{"ts":"...","level":"info","event":"scan.submit","requestId":"...","userId":"...","scanId":"...","fileSize":2411234,"fileType":"image/jpeg"}

{"ts":"...","level":"error","event":"truthscan.error","requestId":"...","scanId":"...","endpoint":"/detect","upstreamStatus":503,"durationMs":15022}

{"ts":"...","level":"warn","event":"quota.exceeded","requestId":"...","userId":"...","used":10,"limit":10}
```

### Conventions

- `durationMs` for timing — always milliseconds, always integer.
- `upstreamStatus` for HTTP codes from TruthScan or Spaces.
- `errorCode` for our enum (see `ERRORS.md`). Separate from `upstreamStatus`.
- Counts are `n<Thing>` (e.g. `nScans`, `nKeys`). Never plural bare (`scans`).

---

## What we log

### Per-request (entry + exit, at the router)

```
req.start    { method, path }
req.end      { method, path, status, durationMs }
```

One pair per `/api/*` request. Enables latency percentiles and request-rate graphs.

### Session

```
session.issue    { userId }                    // on first-visit cookie mint
session.invalid  { cookiePresent: true }       // HMAC verify failed
```

Not logging `session.verify.ok` — it's the vast majority of cookie activity, noise.

### Scan lifecycle

```
scan.upload_url   { scanId, fileSize, fileType }
scan.submit       { scanId, truthscanId }
scan.poll         { scanId, truthscanId, state, heatmapStatus, analysisStatus }
scan.complete     { scanId, truthscanId, verdict, aiLikelihood, agreement, durationMs }
scan.failed       { scanId, errorCode, upstreamStatus }
scan.deleted      { scanId }
scan.restored     { scanId }
```

`scan.poll` is the noisiest event — one per poll. Log at `debug` level, only surfaced if we explicitly tail with a debug filter. `scan.complete` and `scan.failed` are the ones we actually want.

`scan.complete` includes `durationMs` from submit → terminal state. This is our product metric.

### TruthScan interactions

```
truthscan.call     { endpoint, scanId?, durationMs }     // level=info
truthscan.error    { endpoint, scanId?, upstreamStatus, durationMs }  // level=error
truthscan.timeout  { endpoint, scanId?, timeoutMs }      // level=error
truthscan.retry    { endpoint, scanId, attemptN, previousStatus }  // level=warn
```

Every outbound call — lets us compute TruthScan's own uptime independent of theirs, track response-time percentiles, and catch creeping slowdown before users notice. `truthscan.retry` is specifically for the `/detect` auto-retry (see ERRORS.md) — the rate of these tells us whether retries are actually recovering scans or just doubling our credit burn.

### Quota

```
quota.reserve    { userId, reserved, committed, limit }
quota.commit     { userId, reserved, committed }
quota.release    { userId, scanId, reason }   // "abandoned" | "failed"
quota.exceeded   { userId, used, limit }
```

### Assets

```
asset.serve      { kind: "preview" | "heatmap", scanId, cacheHit, durationMs }
asset.unavailable { kind, scanId, reason }    // upstream 404/failed
```

### Cron / background

```
purge.run     { nExamined, nPurged, durationMs }
purge.error   { errorCode, message }
```

---

## What we never log

- **TruthScan API key.** Obviously.
- **`COOKIE_SIGNING_KEY`** or any derived signature.
- **Full filenames.** Log `fileType` and `fileSize`; filename is user-supplied and can contain PII (e.g. `my_passport.jpg`).
- **IP addresses.** Cloudflare stores them at the edge layer; we don't need them in application logs.
- **User-supplied image bytes or any image content.**
- **Cookie values** (full or partial).
- **Entire TruthScan response bodies.** Log the fields we care about (verdict, status) not the blob.
- **Preview or heatmap URLs** (TruthScan-signed, time-limited; no real harm, but also no reason).

If a log field could appear in a screenshot of a support conversation and make anyone uncomfortable, don't log it.

---

## Metrics

Cloudflare Workers exposes basic metrics in the dashboard automatically:

- Requests / second
- CPU time (p50, p99)
- Error rate (by status class)

These are free and sufficient for "is the Worker alive and responsive." Beyond that, we derive metrics from structured logs via Logpush + a destination (see [Future-state upgrades](#future-state-upgrades)).

### Derivable from logs (MVP)

For MVP, ad-hoc queries via `wrangler tail` are enough. Once we enable Logpush to R2 or a destination like Grafana/Datadog, these become dashboards:

- **Scan success rate** = count(`scan.complete`) / (count(`scan.complete`) + count(`scan.failed`))
- **Scan duration p50/p95/p99** = percentiles of `scan.complete.durationMs`
- **TruthScan error rate** = count(`truthscan.error`) / count(`truthscan.call`)
- **TruthScan latency** = percentiles of `truthscan.call.durationMs` bucketed by `endpoint`
- **Quota exhaustion rate** = count(`quota.exceeded`) / count(`scan.upload_url`)
- **Daily active users** = count(distinct `userId`) per day
- **Scans per user** = count(`scan.complete`) grouped by userId, per day

---

## Alerts

MVP-appropriate alerting: email or Slack webhook from Cloudflare, no PagerDuty.

### P0 — the site is down for everyone

- **TruthScan API key invalid (403 "User verification failed")** — means our key is revoked/expired. Fires on any single occurrence. Action: rotate the key, deploy.
- **Worker 5xx rate > 5% for 5 minutes** — something we did broke. Action: check recent deploys, consider rollback.

### P1 — service degraded

- **TruthScan error rate > 20% for 10 minutes** — their side or ours. Action: check TruthScan status page, contact support.
- **TruthScan credit exhaustion (403 "Not enough credits")** — we've hit our paid cap. Action: top up.
- **Worker error rate (4xx excluded) > 2% for 15 minutes** — creeping bugs.
- **Scan duration p95 > 45s for 15 minutes** — slowness trending up. Action: investigate TruthScan timing, our polling cadence, or KV write latency.

### P2 — worth looking at, not urgent

- **Quota exhaustion rate > 10% of sessions** — we may have set the daily cap too low. Not a system failure, but a product signal.
- **Purge job failed** — one-shot cron error. Action: re-run manually, investigate next day.
- **HEATMAP_UNAVAILABLE rate > 10%** — TruthScan's heatmap generation is flaky. Notify them, but the scans are still working.

### How alerts get configured

For MVP: Cloudflare has built-in notifications for Worker errors (5xx rates) and "monitor" features for custom conditions. Otherwise, a simple Cloudflare Cron Trigger (every 5 min) that queries the last 5 min of logs and fires a webhook on threshold breaches. Roughly 50 lines of code in a separate worker.

---

## Debugging a scan

Common case: a user reports "my scan got stuck" or "the result was wrong."

### Step 1: find the scan

User provides scanId from URL, or we look it up from their userId (if they're authenticated into support somehow — for MVP, they'd paste the URL).

### Step 2: check KV

```
scan:<scanId>   →  last state we observed
user:<userId>   →  session info, scan count
```

Gives us our-side state: verdict, timestamps, `deletedAt`, which states we reached.

### Step 3: check logs by scanId

`wrangler tail` filtered on `scanId` (when Logpush is live, this becomes a dashboard query):

```
scan.upload_url   → did they get a URL?
scan.submit       → did we submit to TruthScan?
truthscan.call (endpoint=/detect)  → what did TruthScan say?
scan.poll (multiple)  → what state did each poll see?
scan.complete / scan.failed  → how did it terminate?
```

If one of these is missing, we know where the pipeline broke.

### Step 4: check TruthScan directly

If our logs show we submitted but never got a terminal state, `POST /query` with the scanId against TruthScan lets us see their current state directly. (For MVP this is a manual curl; eventually an admin endpoint.)

### Step 5: reconcile

Sometimes TruthScan has a state we missed (poll terminated early, heatmap finished after we stopped). Re-poll, update KV, inform the user.

---

## Correlation IDs

- **`requestId`** — generated at Worker entry (`crypto.randomUUID()`), attached to every log line in that request. Ties together "request came in, called TruthScan, wrote KV, returned response."
- **`scanId`** — our UUID for the scan. Generated at upload-url, used as the KV key and URL slug. Present in every scan-related log from upload-url through completion.
- **`truthscanId`** — TruthScan's UUID for the same scan, returned by their `/detect` response. Stored on the scan record; present on `scan.submit`/`scan.poll`/`scan.complete` and on `truthscan.call`/`truthscan.error` log lines once known. This is the id to hand to TruthScan support.
- **`userId`** — stable for the life of the anonymous session. Present on every authenticated request.

When a user reports a bug, these IDs let us reconstruct the full timeline. `scanId` is the most user-visible — it's in the URL (`/scan/abc123`) — and is what we'd ask for in support. `truthscanId` is our handoff to TruthScan.

**Avoid:** TruthScan's `document_id` from the `/get-presigned-url` response. We discard it at presign time; `truthscanId` (from `/detect`) is the correlation ID TruthScan's support actually uses to look up a scan.

---

## Retention

- **Workers console logs (`wrangler tail`)** — real-time only, no persistence. Fine for active debugging.
- **Logpush → R2 / destination** — post-MVP. 30 days retention is standard. We'd need this before any real user base.
- **KV** — our scan records retain forever (until soft-delete + 30 day purge). This is our long-term source of truth for user history.
- **Audit trail** — not in scope for MVP. Post-account-creation, we'd want a separate "audit" prefix in KV for admin-sensitive actions.

---

## Future-state upgrades

Parked items, in rough priority order:

1. **Logpush to R2.** First thing we do when log volume outgrows `wrangler tail`. Enables dashboards and longer-range debugging.
2. **Structured log viewer.** Grafana Cloud free tier reads from R2. Or Baselime, which is Workers-native. Or Axiom.
3. **Real-user monitoring (RUM).** Capture frontend performance — how long upload actually takes on real devices, time-to-verdict from user perspective. Cloudflare Web Analytics is free.
4. **Distributed tracing.** Once we're making more than 2–3 upstream calls per request, OpenTelemetry in the Worker lets us see where time actually goes.
5. **Synthetic monitoring.** A scheduled Worker that runs a full scan against a known test image every 5 minutes. Catches problems before real users do.
6. **Error budget tracking.** Once we have real SLOs ("99.5% of scans complete within 30s"), burn rate alerts.

None of these are needed for MVP. All are additive; none require architectural changes to enable.
