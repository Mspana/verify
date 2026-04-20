# Architecture

> AI image detection app for small Chinese businesses. Mobile-first web, free tier, TruthScan-backed.

This doc captures the system design decisions for the MVP. Agents building the app should treat it as authoritative; push back before deviating.

---

## Table of contents

1. [Product scope](#product-scope)
2. [System overview](#system-overview)
3. [Trust zones and secrets](#trust-zones-and-secrets)
4. [Worker endpoints](#worker-endpoints)
5. [Polling state machine](#polling-state-machine)
6. [Normalized response contract](#normalized-response-contract)
7. [Upload flow](#upload-flow)
8. [Session and identity](#session-and-identity)
9. [Storage (Workers KV)](#storage-workers-kv)
10. [Deployment](#deployment)
11. [Open items](#open-items)

---

## Product scope

- Mobile-first web app for uploading product photos and checking if they're AI-generated
- Three verdicts: human (likely real) · AI generated · can't verify
- Free for MVP; no accounts (anonymous sessions via signed cookie)
- Hosted on Cloudflare Pages + Workers for mainland China reach without ICP
- Backed by TruthScan's detection API

Non-goals for MVP: accounts, payments, bulk upload, admin tooling, multi-language UI beyond bilingual labels.

---

## System overview

Four participants:

1. **Browser** — static SPA served from Cloudflare Pages. Mobile-first. Talks only to our Worker.
2. **Cloudflare Worker** — our API. Proxies all TruthScan traffic, holds the API key, writes to KV.
3. **TruthScan API** — detection, heatmap generation, deep analysis. Never contacted by the browser directly.
4. **DigitalOcean Spaces** — TruthScan's upload bucket. Browser PUTs image bytes here using presigned URLs. One exception to "browser only talks to our Worker."

The browser → Spaces exception exists because presigned URLs are explicitly designed for direct client uploads. The alternative (upload through Worker) doubles bandwidth and hits request-size limits. The presigned URL is scoped to one PUT of one key, expires in an hour, and can't be used for anything else.

```
Browser  ─────────►  Worker  ─────────►  TruthScan
   │                    │
   │                    └─────────►  Workers KV
   │
   └─ PUT bytes ────────────────►  Spaces (presigned)
```

---

## Trust zones and secrets

Three zones:

- **Untrusted (browser)** — holds nothing sensitive. Validates for UX but is always re-validated server-side.
- **Trusted (Worker + KV)** — holds the TruthScan API key and cookie signing secret as Workers Secrets. Owns all auth decisions.
- **Third-party (TruthScan + Spaces)** — reached only by the Worker. Never addressable from the browser.

Secrets (set via `wrangler secret put`):

| Name | Purpose |
|------|---------|
| `TRUTHSCAN_API_KEY` | TruthScan detection API key. Different per environment. |
| `COOKIE_SIGNING_KEY` | 32+ byte random string for HMAC. Rotating invalidates all active sessions. |

No secrets in `.env` files committed to the repo. Local dev uses `.dev.vars` (gitignored).

---

## Worker endpoints

All endpoints are under `/api/*`. Same origin as the frontend — no CORS.

### Session

- `POST /api/session` — Issues signed anonymous userId cookie on first visit. Idempotent; returns existing userId if cookie valid.

### Scan lifecycle

- `POST /api/scan/upload-url` — Requests a presigned upload URL from TruthScan. Reserves a quota slot. Returns `{ uploadUrl, filePath, scanId }`.
- `POST /api/scan/submit` — Called after the browser uploads bytes. Worker calls TruthScan `/detect` with our flags. Commits quota slot. Returns `{ scanId, state: "polling" }`.
- `GET /api/scan/:id` — Polling endpoint. Calls TruthScan `/query`, normalizes the response, returns whatever's ready.

### Assets (proxied)

- `GET /api/scan/:id/preview` — Streams the preview image. Ownership-checked against KV. Edge-cached 1 hour.
- `GET /api/scan/:id/heatmap` — Streams the transparent heatmap PNG. Returns 202 if not yet ready.

### History

- `GET /api/scans` — Lists user's scans, newest first. Supports `?limit=20&cursor=...`. Excludes deleted scans by default; `?deleted=true` returns trash.
- `DELETE /api/scan/:id` — Soft-delete. Marks `deletedAt`, moves from scans index to trash index. Retrievable for 30 days.
- `POST /api/scan/:id/restore` — Reverses soft-delete if within 30-day window.

### Meta

- `GET /api/quota` — Returns `{ used, limit, resetsAt }` for the current user.
- `GET /api/health` — Proxies TruthScan health check. Returns combined status.

### TruthScan `/detect` flags we send

Always:

```json
{
  "generate_preview": true,
  "generate_analysis_details": true,
  "generate_heatmap_overlayed": false,
  "generate_heatmap_normalized": true,
  "id": "<our scanId>"
}
```

`generate_heatmap_overlayed: false` gives us a transparent PNG we can composite client-side with an opacity slider. Analysis is expensive; making it paid-tier-only is a post-MVP consideration.

---

## Polling state machine

Driven by the frontend. The Worker is stateless per-poll.

```
idle
  │  user picks file
  ▼
requesting_upload  ──►  uploading  ──►  submitting  ──►  polling
                                                            │
                                                   verdict ready
                                                            ▼
                                                        partial
                                                            │
                                              heatmap + analysis reach
                                                   terminal states
                                                            ▼
                                                       complete

Any stage can fail → error (terminal)
```

Transitions:

- `polling → partial` fires as soon as TruthScan returns the core verdict. Frontend shifts from "Analyzing image" screen to the result page with skeleton loaders for heatmap and analysis.
- `partial → complete` fires when heatmap AND analysis have both reached a terminal state: `ready`, `failed`, or `skipped`. Individual asset failures are soft — we show the verdict, mark the failed asset with a small inline error, and still transition to `complete`.
- `error` is reached only when the scan itself fails (upload, submit, or TruthScan returns `status: "failed"`). Heatmap/analysis failure does not trigger this.

Polling cadence: 2s initial, exponential backoff to 5s max. Frontend keeps polling `/api/scan/:id` until state is `complete` or `error`. Navigating away mid-scan and returning resumes polling based on the `:id` in the URL — no global state for in-flight scans.

---

## Normalized response contract

The frontend codes against our shape, not TruthScan's. The Worker owns the translation.

```json
{
  "id": "7a31bd2a-...",
  "state": "complete",
  "createdAt": "2026-04-16T14:22:00Z",
  "filename": "portrait-outdoor.jpg",

  "verdict": {
    "status": "ready",
    "label": "ai",
    "headline": "AI generated",
    "aiLikelihood": 90.24,
    "confidence": 90.24
  },

  "preview": {
    "status": "ready",
    "url": "/api/scan/7a31.../preview"
  },

  "heatmap": {
    "status": "ready",
    "url": "/api/scan/7a31.../heatmap",
    "mode": "transparent"
  },

  "analysis": {
    "status": "ready",
    "agreement": "strong",
    "imageTags": ["person", "portrait", "outdoor"],
    "keyIndicators": [
      { "label": "Unnaturally smooth skin texture", "supports": "verdict" }
    ],
    "reasoning": "...",
    "recommendations": ["..."]
  },

  "signals": {
    "hasExif": false,
    "screenRecapture": false,
    "watermark": null
  },

  "error": null
}
```

### Field semantics

- `state` is a redundant convenience field — derivable from section statuses, but we compute it server-side so the frontend has one thing to check.
- `verdict.label` is our taxonomy (`human | ai | uncertain`), not TruthScan's free-form strings. When TruthScan adds/renames a verdict, one function in the Worker updates; no frontend changes.
- `verdict.headline` is the display string, separate from `label`. Localizable without touching logic.
- `keyIndicators[].supports` is `"verdict" | "opposite" | "neutral"` — lets the UI render the left-border accent in green/red/amber to support the disagreement variant.
- `signals` is populated from TruthScan's `metadata` and `warnings` on the first poll, part of the CORE stream.
- Asset URLs (`preview.url`, `heatmap.url`) are always our proxy paths. Frontend never sees TruthScan URLs.

Error shape when `state: "error"`:

```json
{
  "error": {
    "code": "UPLOAD_TOO_LARGE" | "UPSTREAM_FAILED" | "QUOTA_EXCEEDED" | ...,
    "message": "This image is 28 MB. Maximum size is 10 MB.",
    "retryable": true
  }
}
```

`code` is a stable enum the frontend branches on. `message` is user-facing. `retryable` determines whether the UI shows Retry vs Go back.

---

## Upload flow

Sequential steps across Browser, Worker, TruthScan, and Spaces:

1. **Client validates** the file (≤10 MB, supported type, filename without spaces). Worker re-validates.
2. **Worker requests presigned URL** from TruthScan `/get-presigned-url`. TruthScan returns `presigned_url` and `file_path`. Worker reserves a quota slot and writes a scan stub to KV under its own generated scanId.
3. **Browser PUTs bytes** to Spaces directly using the presigned URL. The PUT **must** include two headers or Spaces will reject it: `Content-Type` matching the file extension exactly (e.g. `image/jpeg`, not `image/jpg`), and `x-amz-acl: private`. The presigned URL is signed assuming `private` ACL; omitting the header fails the signature. Upload progress tracked via XHR or streaming fetch.
4. **Browser calls `POST /api/scan/submit`** with the scanId and filePath. Worker prepends the configured TruthScan storage base host to the `file_path` to form an absolute URL, then calls TruthScan `/detect` **without** passing `id` — TruthScan returns a freshly-generated id of its own, which we store on the scan record as `truthscanId`. Commits the quota slot.
5. **Browser starts the polling loop** (see state machine). The Worker calls TruthScan `/query` using `truthscanId`, not scanId.

Key choices:

- Two identifiers. `scanId` is ours: generated at upload-url, used as the KV primary key, the URL slug, and the ownership correlator. `truthscanId` is TruthScan's: returned by `/detect`, used for every subsequent `/query`, `/preview`, and `/heatmap` call. See "Identifier correspondence" in Storage for the full mapping and rationale.
- Quota is two-phase. Step 2 reserves; step 4 commits. A background cleanup reclaims stale reservations (> 10 min without submit). Prevents parallel uploads from both slipping past the cap.
- TruthScan's `document_id` from the presign response is still discarded — it's a third identifier with no downstream use.
- **Heatmap may never generate.** TruthScan skips heatmap generation for verdicts it's confident about (most "human" verdicts). The first poll that returns a terminal verdict will carry `heatmap.status: "skipped"` directly — no intermediate `pending`. The scan transitions `polling → complete`, not `polling → partial → complete`. `GET /api/scan/:id/heatmap` returns **404** with body `{"status":"skipped"}` (not 202). The frontend must treat skipped as a terminal non-error state and render the "not available for this image" tile rather than a retry prompt. See the skipped-heatmap entry in `ERRORS.md` for full UX copy.

---

## Session and identity

Anonymous users are identified by a signed cookie, not IP. IPs are shared and unreliable; cookies give us per-user rate limiting, per-user history, and a migration path to real accounts later.

### Cookie format

```
Name:       vfy_uid
Value:      <uuid>.<hmac-sha256(uuid)>
Attributes: HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=1y
```

- Neutral name (`vfy_uid`) doesn't leak app purpose.
- Signature uses `COOKIE_SIGNING_KEY` — client can't forge a different userId.
- HttpOnly blocks JS access (XSS defense).
- Max-Age refreshes on every valid request — active users stay logged in; abandoned ones expire after a year.

### Request lifecycle

Every `/api/*` request:

1. Read `vfy_uid` from the Cookie header. Missing → step 4.
2. Split on `.`, recompute HMAC, compare in constant time. Mismatch → treat as missing.
3. Valid → set `ctx.userId` for downstream handlers. Refresh cookie `Max-Age`.
4. Missing/invalid → generate new UUID, compute signature, issue `Set-Cookie`, write `user:<uuid>` stub to KV.

### Accounts later

When real sign-in ships, the flow reads the existing anonymous `vfy_uid`, associates it with the authenticated account in KV, and issues a new cookie bound to the account. Anonymous history is preserved automatically.

---

## Storage (Workers KV)

Single namespace (`VERIFY_KV`) with four key prefixes.

### Key layout

| Key pattern | Value | Written |
|---|---|---|
| `user:<userId>` | `{ createdAt, lastSeenAt, scanCount }` | Cookie issue; updated on each request |
| `scan:<scanId>` | Full normalized scan record + `deletedAt` | Stub at upload-url; updated on poll transitions; mutated by delete/restore |
| `idx:scans:<userId>:<ts-desc>:<scanId>` | `""` (empty; key IS the data) | On submit; removed on delete |
| `idx:trash:<userId>:<ts-desc>:<scanId>` | `""` | On delete; removed on restore; removed by purge job at day 30 |
| `quota:<userId>:<YYYY-MM-DD>` | `{ reserved, committed }` | Daily. 48h TTL. |

### Key tricks

- **Secondary indexes.** KV has no queries, only prefix listing. To list a user's scans newest-first, we prefix-list `idx:scans:<userId>:`, parse scanIds from the returned keys, and batch-fetch the real records. Two keys per scan (record + index entry).
- **Reverse timestamp (`ts-desc`).** Computed as `(9999999999999 - createdAt)`. KV sorts keys lexicographically ascending; reverse-ts puts newest first without pagination to the end.
- **Two separate indexes for soft-delete.** Active scans live in `idx:scans:`; deleted ones in `idx:trash:`. Each view is one cheap prefix list — no filtering needed at read time.

### Identifier correspondence

Two IDs live on every scan record. Only one crosses each boundary:

- **`scanId`** — ours. Generated by the Worker at upload-url. Primary KV key (`scan:<scanId>`), URL slug (`/api/scan/:id`), reservation key, ownership correlator on logs. User-visible via the URL.
- **`truthscanId`** — theirs. Returned in the `/detect` response. Sent back to TruthScan on every subsequent `/query`, `/preview`, `/heatmap` call. Worker-internal only; never exposed to the frontend.

Why two: TruthScan auto-assigns a `document_id` at `/get-presigned-url` and rejects any `/detect` whose `id` matches one it has already issued — so we can't force our scanId through. `truthscanId` on the record is what lets us correlate our logs with a TruthScan support conversation. The `document_id` from the presign response is discarded; one correlation ID per side is enough.

### Soft-delete lifecycle

- **Delete** (DELETE /api/scan/:id): set `scan.deletedAt = now`, remove `idx:scans:` entry, write `idx:trash:` entry.
- **Restore** (POST /api/scan/:id/restore): clear `deletedAt`, move index entry back. Works only within 30-day window; the record must still exist.
- **Purge** (Cloudflare Cron Trigger, daily): prefix-list `idx:trash:` keys, parse `ts-desc`, delete any older than 30 days (both the index entry and the `scan:<id>` record).

### What we don't store

- The image itself. TruthScan keeps it; we reference via our proxy. Eventually moving to in-house storage (so we can swap detectors / compare providers) is a post-MVP task.
- TruthScan's raw response. We store our normalized shape. Raw can be refetched with the scanId if ever needed.
- PII (IP, user agent, location).

### Scale notes

Per scan: ~2–4 KB record + two small index entries. Free KV plan: 100K reads/day, 1K writes/day, 1 GB storage. Easily supports a few hundred daily active users.

---

## Deployment

### Deployment architecture — current (2026-04-19)

The Worker serves both the API (`/api/*`) and the static frontend (all other paths, via the Workers Static Assets binding). This consolidation is in place because we haven't yet registered a custom domain; the `*.workers.dev` subdomain can only route to one service, so a Pages + Worker split leaves the frontend unable to reach the API on the same origin (and HttpOnly session cookies won't carry cross-origin).

The split architecture described below is the intended end state once a domain is registered and `/api/*` / `/*` routes can be bound separately.

See commit `3436c89` for the consolidation change. Reverting is roughly:

1. Remove the `[assets]` block from `worker/wrangler.toml`.
2. Restore the `c.text("Not found", 404)` branch in `worker/src/index.ts`'s `notFound` handler (drop the `env.ASSETS.fetch` fall-through).
3. Drop the `ASSETS: Fetcher` binding from `worker/src/types.ts`.
4. Restore `worker/package.json`'s `deploy` script to `wrangler deploy` (the Pages project builds the frontend separately).
5. Reconfigure the Cloudflare dashboard: re-enable the Pages project, point the domain's `/api/*` at the Worker, and everything else at Pages.

### Repo layout (monorepo, npm workspaces)

```
verify/
├── web/                    # frontend → Cloudflare Pages
│   ├── src/
│   ├── public/
│   └── package.json
├── worker/                 # API → Cloudflare Workers
│   ├── src/
│   │   ├── index.ts
│   │   ├── handlers/
│   │   ├── lib/
│   │   │   ├── truthscan.ts
│   │   │   ├── cookie.ts
│   │   │   ├── kv.ts
│   │   │   └── quota.ts
│   │   └── normalize.ts    # TruthScan → our shape
│   └── wrangler.toml
├── shared/                 # types shared between web and worker
│   └── types.ts
└── package.json
```

`shared/` is load-bearing. Both packages import types from it so the response contract stays in sync. When we change the normalized shape, TypeScript errors fire on both sides simultaneously.

### Routing

Single domain, no CORS:

- `/api/*` → Worker route
- `/*` → Cloudflare Pages (static SPA build)

### Environments

| Env | Setup |
|---|---|
| local | `wrangler dev` + Vite dev server. KV via miniflare local storage. TruthScan key from `.dev.vars` (gitignored). |
| preview | Every PR auto-deploys to `<branch>.verify.pages.dev`. Worker preview env shares staging KV + a staging TruthScan key with a credit cap. |
| production | Merge to `main` deploys to `verify.app`. Production KV, production TruthScan key, production signing secret. |

### Pipeline

1. Push branch → GitHub Actions runs typecheck + tests in parallel.
2. Open PR → Cloudflare Pages builds `web/` and deploys to preview URL. Worker deploys to preview env via `wrangler deploy --env preview`.
3. Merge to `main` → Worker deploys first (handles both old and new clients during the deploy window), then Pages. Health check gates rollout.

### Avoid for MVP

- Turborepo, Nx, or other monorepo tooling. npm workspaces are enough.
- Feature flags / canary deploys.
- Observability beyond Workers built-in logs (covered in its own doc).
- Database migrations (KV has no schema; shape is versioned in code).

---

## Open items

To be covered before build starts:

- **Error handling catalog** — every failure mode across the system (upload rejects, TruthScan down, quota exceeded, asset failures), their error codes, and how each surfaces to the user.
- **Observability and monitoring** — what we log from Workers, where alerts fire, how we'd debug a scan that went sideways. Structured logs, Logpush/Tail, KV diagnostic reads, TruthScan correlation IDs.
- **Rate limit specifics** — exact quota numbers (scans per day per user), the `QUOTA_EXCEEDED` UX, whether we differentiate registered users later.

Post-MVP backlog:

- Accounts + WeChat login (needs mainland Official Account + ICP filing — possible via Chinese partner)
- Payment / subscription tier (deep analysis behind paywall is one candidate)
- In-house image storage (enables detector swapping and multi-provider comparison)
- Chinese-only UI variant
- Native mobile apps
