# Error handling

> Every failure mode across Verify, how it surfaces to the user, and what it does under the hood.

Companion to `ARCHITECTURE.md`. Anything not specified here defaults to a generic upstream-failed treatment; agents adding new failure paths should extend this catalog rather than inventing handling.

---

## Table of contents

1. [Principles](#principles)
2. [Error code enum](#error-code-enum)
3. [Client-side validation](#client-side-validation-browser-only)
4. [Upload failures](#upload-failures-spaces)
5. [Submit failures](#submit-failures-truthscan-detect)
6. [Poll / scan lifecycle failures](#poll--scan-lifecycle-failures)
7. [Asset failures (heatmap / preview)](#asset-failures-heatmap--preview)
8. [Session failures](#session-failures)
9. [Quota and rate-limit failures](#quota-and-rate-limit-failures)
10. [Network and degraded-service failures](#network-and-degraded-service-failures)
11. [Retry policy](#retry-policy)
12. [What we never show the user](#what-we-never-show-the-user)

---

## Principles

1. **Errors are for users first, operators second.** The `message` field is always user-facing and should tell the user what to do next. Operator detail goes in logs, not UI.
2. **One stable enum for branching.** The frontend branches on `error.code`. Messages can change freely; codes are contracts.
3. **Retryable is a property, not a guess.** Every error carries `retryable: true | false`. The UI shows Retry only when true.
4. **Partial success is success.** Heatmap fails but verdict works? The scan is `complete`, not `error`. Users see the verdict and a small inline note on the failed asset.
5. **No error codes leak through as jargon.** `TS_TIMEOUT_504` is for the support footer, not the headline.

---

## Error code enum

Stable contract between Worker and frontend. Adding codes is safe; renaming or repurposing is not.

| Code | Where raised | Retryable | Default UX |
|---|---|---|---|
| `FILE_TOO_LARGE` | client + Worker (upload-url) | true | Inline banner on upload screen |
| `FILE_TOO_SMALL` | Worker (upload-url) | true | Inline banner |
| `UNSUPPORTED_TYPE` | client + Worker | true | Inline banner |
| `FILENAME_INVALID` | Worker | true | Inline banner (usually auto-fixable by renaming) |
| `UPLOAD_FAILED` | browser → Spaces | true | Full-page scan error |
| `UPLOAD_EXPIRED` | browser → Spaces (presigned URL expired) | true | Full-page; auto-retries with fresh URL once |
| `SUBMIT_FAILED` | Worker → TruthScan /detect | true | Full-page |
| `QUOTA_EXCEEDED` | Worker (upload-url) | false | Dedicated quota screen with reset time |
| `SCAN_NOT_FOUND` | Worker (any /scan/:id route) | false | Redirect to home with toast |
| `SCAN_FAILED` | poll sees TruthScan `status: "failed"` | true | Full-page |
| `SCAN_TIMEOUT` | poll exceeds ceiling without terminal state | true | Full-page |
| `HEATMAP_UNAVAILABLE` | asset stream | soft | Inline on the heatmap tile |
| `ANALYSIS_UNAVAILABLE` | asset stream | soft | Inline on analysis section |
| `PREVIEW_UNAVAILABLE` | asset stream | soft | Fallback placeholder |
| `SESSION_INVALID` | Worker (cookie verify) | auto | Silent reissue, request retried |
| `UPSTREAM_DOWN` | TruthScan /health fails | false | Site-wide degraded banner |
| `RATE_LIMITED` | Cloudflare edge or Worker | true | Full-page, with wait-then-retry |
| `INVALID_REQUEST` | Worker (client-level 400) | true | Request body failed validation or semantic checks (e.g. filePath mismatch on submit). User can fix and retry. |
| `INTERNAL_ERROR` | anything unhandled | true | Full-page generic |

---

## Client-side validation (browser only)

Checked before `/api/scan/upload-url` to avoid round-trips for obviously-bad files. Worker re-validates everything — client checks are UX, not security.

### File too large

- **Trigger:** file > 10 MB.
- **UX:** inline banner above the upload area. "This image is 12 MB. Maximum is 10 MB. Try a smaller file or convert to JPG."
- **Action:** user picks a different file; state never leaves the home screen.

### Unsupported type

- **Trigger:** MIME type not in allowlist. Allowlist: JPG, JPEG, PNG, WebP, HEIC, HEIF. (TruthScan supports more; we constrain to common consumer formats for MVP.)
- **UX:** "This file type isn't supported. Try JPG, PNG, or HEIC."
- **Action:** user picks different file.

### HEIC from iPhone

- **Trigger:** file is HEIC/HEIF.
- **Behaviour:** client converts to JPEG using `heic2any` before upload. No user-facing error; this is transparent.
- **Fallback:** if conversion fails (rare, usually due to unusual HEIC variants), surface as `UNSUPPORTED_TYPE` with message "We couldn't read this HEIC file. Export as JPG from Photos and try again."

### Filename with spaces or unsafe chars

- **Trigger:** filename contains spaces, quotes, slashes, or non-ASCII.
- **Behaviour:** client normalizes (replace spaces with `-`, strip unsafe chars) silently before requesting presigned URL. No user-facing error.

---

## Upload failures (Spaces)

Between client and Spaces, on the presigned PUT.

### `UPLOAD_FAILED`

- **Trigger:** non-200 from Spaces PUT, or fetch throws.
- **Likely causes:** network drop, Content-Type mismatch, presigned URL revoked, Spaces outage.
- **UX:** full-page scan error.
  - Headline: "Upload couldn't finish"
  - Body: "Your connection may have dropped. Your image wasn't saved."
  - Primary: "Retry" — restarts the whole flow with a fresh presigned URL.
  - Secondary: "Go back" — returns to home.
- **Quota:** the reserved slot is released automatically after 10 min; eager release happens when the user abandons the error screen.

### `UPLOAD_EXPIRED`

- **Trigger:** 403 or SignatureDoesNotMatch from Spaces with timestamp > URL expiry.
- **UX:** auto-retry once with a fresh presigned URL before surfacing. If the retry also fails, treat as `UPLOAD_FAILED`.
- **Rationale:** the user didn't do anything wrong; they just took too long on the scan screen. Surfacing the raw error is hostile.

### Network offline mid-upload

- **Trigger:** fetch rejects with `TypeError` while upload in progress.
- **UX:** small toast ("You're offline. We'll retry when you're back.") + in-place retry loop with exponential backoff, capped at 3 attempts.
- **After 3 attempts:** surface as `UPLOAD_FAILED`.

---

## Submit failures (TruthScan /detect)

Worker calls TruthScan `/detect` after the bytes are in Spaces.

### `SUBMIT_FAILED`

- **Trigger:** TruthScan returns non-2xx, or times out (> 15s), AND our auto-retry also failed.
- **UX:** full-page scan error.
  - Headline: "We couldn't start the scan"
  - Body: "The detection service didn't respond. Your image wasn't scanned."
  - Primary: "Retry" — re-submits the same uploaded file (filePath still valid).
  - Secondary: "Go back"
  - Footer: "Error code: SUBMIT_FAILED · TS_504" (or whatever TruthScan returned)
- **Behaviour:** Worker auto-retries ONCE on timeout or 5xx before surfacing. Short backoff (1s) between attempts. 4xx errors (bad request, auth, etc.) are not retried — those won't recover.
- **Known trade-off:** if the first submit actually succeeded but the response was lost, the retry creates a duplicate scan on TruthScan's side and double-bills credits. Accepted for MVP at this volume; revisit when costs matter. See "Revisit later" in retry policy.

### TruthScan returns 403 "Not enough credits"

- **Trigger:** our org is out of TruthScan credits.
- **UX:** full-page with specific headline "Service temporarily unavailable" — do NOT tell the user "we're out of credits," because that's our operational problem. Message: "We're having trouble processing scans right now. Please try again later."
- **Alert:** this is a P1 operator alert. Fires to our on-call channel.
- **Retryable:** false from the user's perspective (retrying won't help them); operator must top up.

### TruthScan returns 403 "User verification failed"

- **Trigger:** our API key is invalid, expired, or revoked.
- **UX:** same as credits exhaustion — "Service temporarily unavailable."
- **Alert:** P0 operator alert. This means the site is broken for everyone.

---

## Poll / scan lifecycle failures

Browser polls `/api/scan/:id` every 2–5s. Errors here are on scans that were accepted but went sideways during TruthScan processing.

### `SCAN_FAILED`

- **Trigger:** `/query` returns `status: "failed"`.
- **UX:** full-page.
  - Headline: "Scan couldn't finish"
  - Body: (use TruthScan's error message if user-friendly, e.g. "The image couldn't be read"; otherwise generic "Something went wrong with the analysis.")
  - Primary: "Retry" — kicks off a new upload flow for the same local file if still in memory; otherwise "Scan another image."
- **KV:** scan record is marked `state: "error"` and kept. Appears in history with an error indicator.

### `SCAN_TIMEOUT`

- **Trigger:** scan has been polling for > 2 minutes without reaching a terminal core verdict.
- **Rationale:** TruthScan normal timing is 5–15s for core. Something's stuck.
- **UX:** same as `SCAN_FAILED` but with message "The scan took longer than expected."
- **Behaviour:** frontend stops polling; user can manually revisit via history URL (maybe it finished later). A background worker could re-poll once after 5 min and update KV, but that's optimization for later.

### `SCAN_NOT_FOUND`

- **Trigger:** GET `/api/scan/:id` where the scanId doesn't exist in KV, OR exists but isn't owned by the current userId.
- **UX:** silent redirect to home + toast: "That scan isn't available."
- **Rationale:** we don't distinguish "doesn't exist" from "not yours" — same UX, blocks enumeration.
- **Logged** as a warning (could indicate a bug or a URL shared between users).

### Deleted scan accessed via URL

- **Trigger:** scan exists but has `deletedAt` set and is more than 30 days old (or purge has already removed it).
- **UX:** same as `SCAN_NOT_FOUND`.
- **Within 30 days:** scan loads normally but with a "Deleted · Restore" banner instead of the normal header.

---

## Asset failures (heatmap / preview)

These are SOFT failures. The scan stays `complete`; individual assets degrade gracefully.

### `HEATMAP_UNAVAILABLE`

- **Trigger:** TruthScan returns `heatmap_status: "failed"`.
- **UX:** the Heatmap tab on the result page shows a small tile:
  - Icon: muted
  - Text: "Heatmap unavailable"
  - Subtext: "The verdict is still accurate. The visual breakdown couldn't be generated for this image."
- **Original tab** works normally. Default view stays "Original."

### Heatmap skipped (distinct from `HEATMAP_UNAVAILABLE`)

- **Trigger:** TruthScan returns `heatmap_status: null` — a deliberate skip, most often on images clearly classified as human where a heat overlay would be meaningless. In our normalized shape this surfaces as `heatmap.status === "skipped"`, and `/api/scan/:id/heatmap` returns **404** with body `{"status":"skipped"}` (not 202 — 202 implies "come back later," which would be wrong here).
- **UX:** same tile as `HEATMAP_UNAVAILABLE` but with copy tuned for the benign case: "Heatmap not available for this image" / "TruthScan doesn't generate one when the verdict is clear." Same muted icon; same "Original tab works normally."
- **Why distinct:** it's not a failure — nothing broke, nothing to retry. Splitting the code out lets the UI treat the two cases differently in copy and logging while sharing the visual tile pattern.

### `HEATMAP_TIMEOUT`

- **Trigger:** heatmap still `pending` after 90s of polling.
- **UX:** same as `HEATMAP_UNAVAILABLE`.

### `ANALYSIS_UNAVAILABLE`

- **Trigger:** `analysis_results_status: "failed"` or `skipped`.
- **UX:** skeleton loaders in the key indicators / reasoning / recommendations sections are replaced by a single muted note: "Detailed analysis unavailable for this image." The verdict banner, confidence, and signals section remain intact.
- **Rationale:** the deep analysis is the bonus; the core verdict is the product. Users must be able to trust the verdict without analysis loading.

### `PREVIEW_UNAVAILABLE`

- **Trigger:** Worker proxy to TruthScan `/preview/:id` returns 404 or 500.
- **UX:** placeholder tile with the filename and file type icon. History rows show a generic thumbnail.
- **Rationale:** rare, but the scan is still navigable without its thumbnail.

---

## Session failures

### `SESSION_INVALID`

- **Trigger:** cookie present but HMAC verification fails.
- **Behaviour:** Worker silently issues a new session and continues the request as if the cookie was missing. The response includes `Set-Cookie`; the client never sees an error.
- **When this surfaces:** it doesn't. Only appears in logs.
- **Exception:** if the request was a mutation that depended on userId (e.g. DELETE a scan), and the freshly-issued session doesn't own that scan, the request fails with `SCAN_NOT_FOUND` (see above).

### Cookie disabled in browser

- **Trigger:** user has cookies disabled; every request re-issues a fresh session.
- **Behaviour:** functional but history won't persist. User can still scan.
- **UX:** a small dismissible banner on first-scan completion: "Enable cookies to keep your scan history."

---

## Quota and rate-limit failures

### `QUOTA_EXCEEDED`

- **Trigger:** Worker checks `quota:<userId>:<date>` at upload-url; reserved + committed ≥ limit.
- **UX:** dedicated screen (not a generic error).
  - Headline: "Daily limit reached"
  - Body: "You've used all your scans for today. Your limit resets at midnight (Beijing time)."
  - Subtext: "Need more? (post-MVP: link to plans)"
  - Secondary action: "See history"
- **Rationale:** this isn't a failure of the system; it's a product limit. Deserves its own UX to feel intentional, not broken.
- **Limit:** 10 scans per day per anonymous user for MVP. Tunable.

### `RATE_LIMITED`

- **Trigger:** Cloudflare edge (automatic) or Worker-enforced throttle fires. Separate from quota — this is anti-abuse.
- **UX:** full-page.
  - Headline: "Slow down for a moment"
  - Body: "Too many requests from your connection. Please wait a minute and try again."
- **Cloudflare response:** 429 with `Retry-After` header. Frontend honors this.

---

## Network and degraded-service failures

### `UPSTREAM_DOWN`

- **Trigger:** `/api/health` shows TruthScan health check failing for > 3 consecutive probes (every 60s).
- **UX:** site-wide banner at the top of every page.
  - "Scanning is temporarily unavailable. Existing scans can still be viewed."
  - Upload area is disabled with a muted overlay.
- **Rationale:** better to tell users before they upload than let them discover it after 10 seconds of spinner.

### Worker cold-start or failure

- **Trigger:** Worker runtime error, hit by Cloudflare's error page.
- **UX:** browser sees a generic Cloudflare 5xx. Frontend catches via fetch and renders `INTERNAL_ERROR` full-page.
- **Observability:** these show up in Wrangler tail; we alert on > 1% 5xx rate.

### Browser offline

- **Trigger:** fetch throws with offline indicator.
- **UX:** toast "You're offline. We'll retry when you're back." + retry loop for idempotent GETs (polling, history). POSTs surface as errors immediately.

---

## Retry policy

Consolidated rules for what retries happen automatically vs requiring user action.

| Situation | Automatic retry? | Strategy |
|---|---|---|
| Cookie verification fails | Yes, silently | Issue new session, continue request |
| Presigned URL expired on upload | Yes, once | Fetch fresh URL, retry PUT once |
| Network offline mid-upload | Yes | Exponential backoff, 3 attempts, then error |
| Heatmap/analysis still `pending` | Yes (polling) | Until 90s ceiling, then `*_UNAVAILABLE` |
| Poll returns 5xx | Yes | Continue polling; apply backoff |
| Poll returns `SCAN_FAILED` | No | Terminal; user retries |
| `/detect` times out or 5xx | Yes, once | 1s backoff; surfaces as `SUBMIT_FAILED` if retry also fails. Risk of duplicate billing accepted for MVP. |
| `/detect` returns 4xx | No | Semantic failure; retry won't help |
| `UPSTREAM_DOWN` banner | N/A | Health check re-probes; banner clears when healthy |
| `RATE_LIMITED` 429 | No | User waits; frontend shows countdown if `Retry-After` set |

General rule: **Retry on transport problems, never on semantic problems.** A 502 from TruthScan might be retryable; a 400 "invalid file" is not.

### Revisit later

- **Auto-retry on `/detect`** is a deliberate cost-vs-UX trade. At MVP volume the duplicate-billing risk is negligible. Reconsider once TruthScan bills meaningfully — options include deduplication on their side (ask them), idempotency keys if TruthScan adds support, or falling back to user-initiated retry.

---

## What we never show the user

Even in error states, these never appear in UI — they belong in logs only:

- TruthScan API key (obviously), document IDs, presigned URLs
- Stack traces
- Our internal scanId if the user didn't already have access to it
- Raw TruthScan error messages that contain operator-facing detail ("User verification failed", "Not enough credits")
- Worker internal error messages
- Upstream status codes, unless translated into user-friendly copy
- KV key names or internal data structure

Error codes (the enum above) are fine to show in the footer of error pages for support purposes — `SUBMIT_FAILED · TS_504` is useful shorthand. Raw upstream errors are not.
