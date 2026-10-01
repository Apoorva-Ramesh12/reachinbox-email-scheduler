# Email Scheduler — BullMQ + Redis + MySQL + Elasticsearch

A production-style email scheduling service and dashboard. It accepts send requests, persists them in MySQL,
schedules each one as a **BullMQ delayed job** (no cron anywhere), sends through **Ethereal fake SMTP**, survives
restarts without losing or duplicating anything, rate-limits per sender across any number of workers, indexes every
email in **Elasticsearch**, and posts a **real Slack message** when a sender hits its hourly cap.

---

## 1. Project overview

| Capability | Where it lives |
|---|---|
| Schedule a batch via API / dashboard | `POST /api/campaigns` → `scheduler.service.ts` |
| Delayed jobs, no cron | `queues/email.queue.ts`, `jobId = emailId`, `delay = sendAt - now` |
| Restart-safe | MySQL is the source of truth; Redis AOF; `reconcileOrphans()` on worker boot |
| Idempotent sending | deterministic `jobId` + atomic DB claim (`UPDATE … WHERE status='scheduled'`) |
| Concurrency | `WORKER_CONCURRENCY` (BullMQ worker option) |
| Min delay between sends | per-sender Redis slot (`SET NX PX`), `MIN_DELAY_BETWEEN_EMAILS_MS` |
| Hourly rate limit | per-sender atomic Lua counter, `MAX_EMAILS_PER_HOUR_PER_SENDER` |
| Slack alert on limit | Slack OAuth → encrypted incoming webhook → live POST on first limit hit per sender-hour |
| Search | Elasticsearch index `emails`, `GET /api/emails/search` |
| Live queue view | Bull Board at `/admin/queues` |
| API docs | Swagger UI at `/docs` |
| Auth | Google OAuth (authorization-code flow) → httpOnly JWT session cookie |

## 2. Architecture

```
                    ┌────────────────────────── React (Vite, Tailwind) ──────────────────────────┐
                    │  Login · Dashboard (Scheduled / Sent / Search) · Compose · Integrations    │
                    └───────────────────────────────────┬────────────────────────────────────────┘
                                                        │  /api (same-origin proxy, cookie session)
┌───────────────────────────────────────────────────────▼───────────────────────────────────────────┐
│ API  (Express, TS)   controllers → services → repositories                                        │
│  /api/auth (Google)  /api/campaigns  /api/emails  /api/senders  /api/slack  /docs  /admin/queues  │
└───────┬───────────────────────────┬───────────────────────────────┬───────────────────────────────┘
        │ 1. INSERT campaign+emails │ 2. addBulk(delayed jobs)      │ 3. index (best-effort)
        ▼                           ▼                               ▼
   ┌─────────┐              ┌──────────────┐                 ┌───────────────┐
   │  MySQL  │◄─ claim/status│ Redis (AOF)  │                 │ Elasticsearch │
   │ source  │   updates     │ BullMQ queue │                 └───────────────┘
   │ of truth│              │ + rate limit │
   └────▲────┘              │   counters   │
        │                   └──────┬───────┘
        │                          │ delayed → active at the right moment
        │              ┌───────────▼────────────┐        ┌────────────┐      ┌───────┐
        └──────────────┤ Worker(s) (N processes)├───────►│ Ethereal   │      │ Slack │
          atomic claim │ concurrency = M each   │ SMTP   │ SMTP       │      │webhook│
                       └───────────┬────────────┘        └────────────┘      └───▲───┘
                                   └─ on hourly cap hit: defer job + notify once ──┘
```

### How scheduling works
1. `POST /api/campaigns` validates (Zod), assigns each lead to a sender round-robin, and computes
   `sendAt = max(start, now) + i × delay`.
2. In **one MySQL transaction** it writes the campaign and all email rows (`status = scheduled`).
3. It then enqueues one BullMQ **delayed job per email** with `jobId = email.id` and `delay = sendAt − now`.
   Redis' sorted set releases each job at its time. There is no polling loop and no cron.
4. A worker picks the job up, passes three gates (below), sends via SMTP, and marks the row `sent`.

### How persistence on restart is handled
- **Redis** runs with AOF (`--appendonly yes`), so delayed jobs survive a Redis restart.
- **Workers are stateless.** Stop the API and/or workers; the delayed jobs stay in Redis and fire when a worker
  returns. Jobs that were mid-flight when a worker died are recovered by BullMQ's stalled-job checker.
- **MySQL is the source of truth.** On every worker boot `reconcileOrphans()` re-adds a job for any email that is still
  `scheduled`/`sending` in MySQL but has no job in Redis (covers "DB committed, Redis enqueue failed" and Redis data loss).
  Re-adding is a no-op for existing jobs because of the deterministic `jobId`.
- Nothing restarts "from scratch": emails already `sent` are never touched again.

### How idempotency works (an email is never sent twice)
Three independent layers:
1. **Deterministic `jobId = email.id`** — BullMQ refuses a second job with the same id.
2. **Atomic claim in MySQL** — `UPDATE emails SET status='sending' … WHERE id=? AND status='scheduled'`. Exactly one
   worker can win; duplicates see 0 affected rows and skip.
3. **Terminal-state check** — a job for an email already `sent`/`failed` is skipped immediately.

Recipients are also de-duplicated inside a campaign.

### How rate limiting & concurrency are implemented
Each job passes three gates in `workers/email.worker.ts`:

| Gate | Mechanism | Scope |
|---|---|---|
| **Min delay between sends** | Redis `SET rl:slot:{sender} 1 PX <MIN_DELAY> NX`. Loser reads `PTTL` and the job is moved back to the delayed set for exactly that long. | per sender, cross-process |
| **Hourly cap** | Lua script: `INCR rl:hour:{sender}:{utcHourWindow}`; if over the limit it `DECR`s and returns "denied". Atomic, so 100 workers cannot over-admit. | per sender, cross-process |
| **Idempotent claim** | MySQL conditional update (above) | per email |

- **Concurrency**: `WORKER_CONCURRENCY` jobs run in parallel per worker process; run more processes to scale out.
- **When the hourly cap is hit** the job is **never dropped or failed**: it is moved (`job.moveToDelayed`) to the start of
  the **next UTC hour window** plus `seq % 1000` ms, which preserves the original order. Its DB row is updated so the
  dashboard shows the new scheduled time. This does not consume a retry attempt.
- **Behaviour under load (1000+ emails at the same instant)**: all 1000 are inserted and enqueued immediately. Workers
  admit at most `limit` per sender per hour and at most one send per `MIN_DELAY` per sender. The rest are parked in the
  delayed set at the next window start, then drain `limit` per hour. Redis work per deferral is O(1); no job is polled
  repeatedly. Adding senders multiplies throughput linearly.
- Both the Lua counter and the slot key use only Redis, so they are correct across multiple workers and instances.
- **Defaults chosen**: min delay **2 seconds** per sender (`MIN_DELAY_BETWEEN_EMAILS_MS=2000`), hourly cap **200 per
  sender** (`MAX_EMAILS_PER_HOUR_PER_SENDER=200`). The per-campaign "hourly limit" from the Compose form is clamped to
  this global maximum.

### Slack notification
`Connect Slack` runs the real Slack OAuth v2 flow with the `incoming-webhook` scope. The returned webhook URL is encrypted
(AES-256-GCM) and stored per user. When a sender first hits its hourly cap in a window, the worker POSTs a message to
that webhook (one notification per sender per hour, not per job). If Slack isn't connected, the hit is silently skipped
(no crash). Connecting later works immediately — the webhook is read from the DB at notification time, no redeploy.

## 3. Tech stack
Backend: Node 20+/22, TypeScript (strict), Express 5, BullMQ, ioredis, MySQL 8 (Knex migrations), Zod, Pino,
Nodemailer (Ethereal), Elasticsearch 8, Bull Board, swagger-ui-express, Vitest + Supertest.
Frontend: React 19, Vite, TypeScript (strict), Tailwind CSS 4, React Router, Vitest + Testing Library.
Infra: Docker Compose (MySQL, Redis w/ AOF, Elasticsearch, optional app containers).

## 4. Prerequisites
- Node.js **20 or newer** and npm
- Docker + Docker Compose (recommended for MySQL/Redis/Elasticsearch)
- A Google account (OAuth), a Slack workspace where you can create apps, internet access (Ethereal account creation)

## 5. Installation
```bash
# from the repo root
npm run install:all          # = npm ci in backend/ and frontend/
cp .env.example .env         # then edit .env (see section 6)
```

## 6. Environment variable setup
Everything is documented inline in [`.env.example`](./.env.example). One file at the repo root is shared by the backend,
the worker and Docker Compose. Generate secrets:
```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY  (must be exactly 64 hex chars)
```
The ones **you** must fill in: `JWT_SECRET`, `ENCRYPTION_KEY`, `BULL_BOARD_PASSWORD`, `GOOGLE_CLIENT_ID/SECRET`,
`SLACK_CLIENT_ID/SECRET`. Ethereal is optional. Secrets are never logged (Pino redaction) and the app refuses to boot with
a malformed config (Zod validation of the environment).

## 7. Docker setup
```bash
docker compose up -d            # MySQL, Redis (AOF), Elasticsearch
docker compose ps               # wait until all are "healthy" (Elasticsearch takes ~30-60s)
```
Full stack in containers (API + worker + frontend on :8080) instead of running Node locally:
```bash
docker compose --profile app up -d --build
```

## 8. Database setup / migrations
Schema lives in `backend/src/db/migrations/` (users, senders, campaigns, emails, slack_connections).
```bash
npm run migrate                 # applies migrations (also runs automatically when API/worker start)
npm --prefix backend run migrate:rollback
```
No seed data is needed: users are created on first Google login and a sender is auto-provisioned on first schedule.

## 9. Redis setup
Provided by Docker Compose with `--appendonly yes`. Verify: `docker compose exec redis redis-cli ping` → `PONG`.

## 10. Elasticsearch setup
Provided by Docker Compose (v8, single node, security off for local dev). The API creates the `emails` index at boot. Verify:
`curl localhost:9200/_cluster/health`. If Elasticsearch is down, scheduling and sending keep working; only indexing/search
degrade (logged as warnings). Set `ELASTICSEARCH_ENABLED=false` to turn it off.

## 11. Google OAuth setup
1. https://console.cloud.google.com → create/select a project → **APIs & Services → OAuth consent screen** (External; add
   your own Google account under **Test users**).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. **Authorized redirect URI:** `http://localhost:4000/api/auth/google/callback`
4. Copy the Client ID / Secret into `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## 12. Ethereal setup
Nothing required: on first schedule (or via **Integrations → Add Ethereal sender**) the app calls Ethereal's real API
(`nodemailer.createTestAccount`) and stores the new SMTP credentials (password encrypted). To use an existing account,
create one at https://ethereal.email/create and set `ETHEREAL_USER` / `ETHEREAL_PASS`. View delivered mail via the
**Preview** link in the *Sent emails* tab or by logging in at https://ethereal.email/messages with the sender credentials.
Multiple senders: click *Add Ethereal sender* more than once; leads are spread round-robin.

## 13. Slack OAuth setup
1. https://api.slack.com/apps → **Create New App → From scratch** → pick a workspace.
2. **OAuth & Permissions → Redirect URLs:** `http://localhost:4000/api/slack/callback`
   (if Slack refuses plain-http localhost, expose the API with a tunnel such as `ngrok http 4000`, set `APP_URL` to the
   https URL and register `<APP_URL>/api/slack/callback`).
3. **Scopes → Bot/User Token Scopes:** add `incoming-webhook`.
4. **Basic Information → App Credentials:** copy Client ID / Secret into `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`.
5. In the dashboard: **Integrations → Connect Slack**, choose a channel, **Allow**. A confirmation message is posted immediately.

## 14–16. Start commands (three terminals, from the repo root)
```bash
# Terminal 1 — API (http://localhost:4000)
npm run dev:api
# Terminal 2 — BullMQ worker
npm run dev:worker
# Terminal 3 — Frontend (http://localhost:5173)
npm run dev:web
```
Production-style: `npm --prefix backend run build && npm --prefix backend start` and
`npm --prefix backend run start:worker`.

## 17. Bull Board
http://localhost:4000/admin/queues — HTTP basic auth: `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD`. Shows delayed, active,
completed and failed jobs live.

## 18. Running tests
```bash
docker compose up -d mysql redis        # integration tests need these (they auto-skip if unreachable)
npm test                                # backend + frontend
npm run typecheck
```
Backend tests: unit (scheduling math, time windows, CSV parsing, crypto, validation), **real-Redis** rate limiter
(50 parallel calls admit exactly the limit), and **real Redis + MySQL + BullMQ worker** integration tests with only the SMTP
hop stubbed: exactly-once delivery, future-dated jobs wait, duplicate-job idempotency, restart/queue-loss recovery,
hourly-limit deferral + a real HTTP webhook receiving exactly one Slack-style notification, and "Slack not connected" safety.
Tests use Redis DB 15 and clean up the users they create.

## 19. API documentation
Swagger UI: http://localhost:4000/docs  ·  raw spec: `/docs.json`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/auth/google` · `/callback` | Google login |
| GET | `/api/auth/me` · POST `/api/auth/logout` | Session |
| POST | `/api/campaigns` | Schedule a batch |
| GET | `/api/emails/scheduled` · `/sent` | Paged lists |
| GET | `/api/emails/search?q=` | Elasticsearch search |
| GET/POST/DELETE | `/api/senders` | Ethereal sender accounts |
| GET | `/api/slack/connect` · `/callback` · `/status`; POST `/api/slack/test`; DELETE `/api/slack` | Slack |
| GET | `/health` | DB + Redis check |

## 20. How to test scheduling
1. Open http://localhost:5173, **Continue with Google** (header shows name, email, avatar).
2. **Compose new email** → subject, body, upload a CSV/TXT (e.g. `leads.csv` below), start time ~2 minutes ahead,
   delay `5`, hourly limit `50` → **Schedule**.
   ```csv
   email
   alice@example.com
   bob@example.com
   carol@example.com
   dave@example.com
   erin@example.com
   ```
3. *Scheduled emails* lists them with their times; they move to *Sent emails* (with an Ethereal **Preview** link) at the
   scheduled instants, 5 s apart.

## 21. How to test restart persistence
1. Schedule a campaign with a start time ~3 minutes away.
2. Open Bull Board → *Delayed* shows the jobs. Stop **both** the API and worker (`Ctrl+C`; for a hard crash use `kill -9`).
3. Start them again (`npm run dev:api`, `npm run dev:worker`). Delayed jobs are still there; the worker log says
   `Database already up to date` and sends at the original times.
4. Confirm each recipient got exactly one message (Preview links / Ethereal inbox) and no row has `attempts > 1`.
5. Optional: lose Redis entirely (`docker compose down redis && docker compose up -d redis` after `FLUSHALL`) and
   restart the worker — `Reconciled orphaned emails into the queue` re-creates the jobs from MySQL.

## 22. How to test rate limiting
Create a campaign with **hourly limit = 2** and 6 leads, delay `0`, start now (needs the worker running).
- 2 emails are sent immediately.
- The other 4 stay *Scheduled* with their time rewritten to the **start of the next UTC hour**; Bull Board shows them in
  *Delayed* — none failed or dropped.
- Worker log: `Email deferred … reason: hourly-limit`.
- Min-delay: set `MIN_DELAY_BETWEEN_EMAILS_MS=10000`, restart the worker, schedule several emails with `delay 0`; sends land 10 s apart per sender.
- Inspect counters: `docker compose exec redis redis-cli --scan --pattern 'rl:*'`.

## 23. How to test the Slack notification
1. **Integrations → Connect Slack** (confirmation message appears in your channel). **Send test message** also works.
2. Run the rate-limit scenario above. Within a second of the limit being hit, the channel receives
   *"Hourly limit reached for sender …"* — exactly once per sender per hour, not once per deferred email.
3. **Disconnect**, repeat with a new sender/hour: no message, no error. Reconnect: notifications resume with no restart.

## 24. How to test Elasticsearch search
- UI: type in the search box above the tabs (recipient, subject or body; fuzzy matching).
- API: `curl -b "session=<cookie>" "localhost:4000/api/emails/search?q=alice&status=sent"`
- Index: `curl "localhost:9200/emails/_count"` and `curl "localhost:9200/emails/_search?q=subject:hello&pretty"`.
Emails are indexed when scheduled and re-indexed on every status change.

## 25. Demo video flow (≤ 5 min)
1. (0:00) Show `docker compose ps` healthy, API + worker + frontend running; Bull Board and Swagger tabs.
2. (0:30) Google login → dashboard header.
3. (0:50) Compose → upload leads → Schedule 6 emails, hourly limit 2 → show Scheduled tab.
4. (1:40) Bull Board: delayed jobs. **Stop API + worker, start them again** — jobs remain, sends still land on time.
5. (2:40) Sent tab + Ethereal preview; rate limit: 2 sent, rest rescheduled to next hour; Slack message arrives.
6. (3:40) Search box (Elasticsearch). Disconnect Slack to show no crash.
7. (4:20) `npm test` green; mention README trade-offs.

## 26. Assumptions & trade-offs
- **Figma:** the design link in the brief was empty, so the UI is my own implementation of the required layout
  (header with user/avatar/logout, Scheduled/Sent tabs, Compose modal, loading/empty/error states). Adjust to the Figma if you have it.
- **Hour windows are fixed UTC hours**, not a rolling 60 minutes. Simpler and atomic; the trade-off is a possible burst at a window edge.
- **Delivery semantics:** exactly-once is guaranteed against duplicate *jobs* and concurrent *workers*. A worker crashing in the
  few milliseconds between SMTP acceptance and the DB update can, after the stale-lock timeout (`STALE_SENDING_LOCK_MS`),
  cause one re-send — true exactly-once over SMTP is impossible without provider-side idempotency keys.
- **Slack** uses the OAuth `incoming-webhook` scope (one channel chosen at install) instead of a bot token + `chat.postMessage`: fewer scopes and no channel management.
- **Auth:** stateless 7-day JWT in an httpOnly, SameSite=Lax cookie. No refresh tokens or CSRF tokens (SameSite + JSON-only API); add a CSRF token if you embed cross-site.
- **Leads** are parsed client-side (any text containing email addresses); the API accepts at most 10,000 per request. Personalisation merge-tags are not implemented.
- **Ethereal** mail is never delivered to real inboxes; use the Preview link.
- Elasticsearch indexing is best-effort and off the request path; MySQL remains authoritative.
- `Bull Board` uses basic auth rather than the Google session, so it can be opened by operators who aren't app users.
- Docker images and the Google/Slack OAuth flows require your own credentials/network and are documented rather than pre-verified in CI.
