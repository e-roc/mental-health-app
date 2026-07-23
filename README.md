# Haven — Mental Health Support App

A mental health web app: users register, complete an intake questionnaire, and are routed to an available provider for a secure realtime chat. Built with Next.js (App Router) on a custom Node server, Postgres + Prisma, WebSockets, and Tailwind.

## Quick start

```bash
npm install
cp .env.example .env
# Fill APP_ENCRYPTION_KEY and APP_INDEX_KEY with 32-byte hex keys:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Point DATABASE_URL at Postgres — local install or:
docker compose up -d db
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Open http://localhost:3000 (set `PORT` to change).

### Seeded demo accounts

All seeded accounts use password `demo-password-123` (demo only — rotate for anything real):

| Account | Email | Role |
| --- | --- | --- |
| Admin | `admin@demo.local` | ADMIN |
| Dr. Ava Chen (AI Test) | `ava.chen@demo.local` | PROVIDER — anxiety, stress, sleep |

The three AI test providers auto-accept chat requests and send canned supportive replies so the full flow is demoable without a human on the other end. Real (human) provider accounts go through the normal ping → accept flow.

## Architecture

```
                    ┌─────────────────────────────┐
  browser ──HTTP──▶ │ server.ts (custom Node)     │ ×N instances
  browser ──WS───▶  │  ├─ Next.js request handler │
                    │  ├─ /ws push layer          │◀─┐
                    │  └─ background jobs         │  │ LISTEN/NOTIFY
                    └────────────┬────────────────┘  │ (lib/pubsub)
                                 ▼                   │
                            Postgres ────────────────┘
```

- **Custom server** (`server.ts`) — one process serves Next.js HTTP, the `/ws` WebSocket endpoint, and background jobs. Any number of instances can run behind a load balancer.
- **Realtime** — clients hold a WebSocket to `/ws` (authenticated by the same httpOnly session cookie as the REST API) and subscribe to channels: `session:<id>` (chat participants only), `provider:self` (incoming pings), `admin`. Every subscription is authorized server-side. Events are **refetch signals only** — clients reload through the authorized REST API, so no PII ever crosses the socket. A slow safety poll covers socket outages; the client reconnects with backoff.
- **Cross-instance fan-out** (`src/lib/pubsub.ts`) — events publish through Postgres LISTEN/NOTIFY, so a message handled by instance A reaches a websocket held by instance B. No extra infrastructure; the `EventBus` interface is the seam for a Redis implementation later.
- **Background jobs** (in `server.ts`) — every 10s: expire PENDING sessions past their connect window and re-route the user; every 30s: recompute schedule-driven availability; hourly: purge expired auth sessions. Jobs run on every instance; all their writes are conditional updates, so overlapping runs are harmless.
- **Race-free routing** — a Postgres **partial unique index** allows at most one PENDING/ACTIVE session per provider. Routing is a claim loop: try the best-matched provider, and on a unique violation (another request claimed them first) drop them from the pool and re-match. Accept/close/expire all use conditional updates, so a provider accepting at the same moment the sweeper expires the session can't resurrect it.
- **Scale notes** — async scrypt keeps password hashing off the event loop; hot query paths are indexed (`status+connectBy` for the sweeper, `sessionId+createdAt` for messages, blind-index email lookups are unique-key hits). Connection pooling: set `connection_limit` in `DATABASE_URL` per instance, and put pgbouncer in front past ~10 instances.

## How it works

1. **Register / log in** — users self-register (role `USER`). Providers cannot self-register; they join by admin invite (below). Admins are seeded.
2. **Questionnaire** — concerns, symptom frequency (PHQ/GAD-style), sleep, safety check. Answers are risk-scored (stub: safety concern → HIGH) and encrypted at rest.
3. **Routing** — `src/lib/matching.ts` scores available providers by specialty overlap with the user's concerns; best match wins, ties broken randomly, **random available provider as fallback** when nobody matches. Providers with a live session are skipped (enforced by the DB, not just the query).
4. **Provider ping** — the matched provider is pinged (notification stub logs the link; their dashboard updates instantly over WebSocket). They must accept within the **connect window** (default 5 min, admin-configurable). If they miss it, the background sweeper expires the session and re-routes the user automatically — no browser needs to be open for this to happen.
5. **Chat** — messages send over REST (validated, rate-limited, encrypted at rest) and arrive via WebSocket push; either side can end the chat.

### Provider availability

Each provider has an `isAvailable` flag, controlled two ways:

- **Manual** — toggle on the provider dashboard.
- **Scheduled** — weekly blocks (day + start/end time, overnight blocks supported). With "auto-switch" enabled, the background sync recomputes the flag every 30s (and at every routing decision).

### Onboarding a provider (invite flow)

1. Admin enters a name + email on `/admin` → **Invite a provider**.
2. The response contains a one-time link (`/invite/<token>`). It is shown **once** — only the token's HMAC is stored, so neither the database nor a later admin page can reproduce a working link.
3. The provider opens the link, sets **their own password** and picks **their own focus areas**, and lands on their dashboard already logged in. The admin never learns the credential.
4. New providers start **unavailable** — they opt in via the toggle or a schedule.

Invites expire after 7 days, are revocable, and single-use (concurrent redeems settled by a conditional claim).

### Admin portal

`/admin` shows users (with last risk level), providers, invites, sessions, and the connect-window setting — all live over WebSocket. Session **metadata only** — never message content. Admins can **override any provider's availability**; an override drops the provider out of schedule mode so the sync can't silently revert it, and is written to the audit log.

## Security posture

- **PII encrypted at rest** — names, emails, questionnaire answers, concern tags, invite details, and every chat message are AES-256-GCM encrypted (`src/lib/crypto.ts`). The database contains no plaintext PII, and WebSocket frames carry no PII either.
- **Blind index for lookups** — emails are looked up via HMAC-SHA256 blind index (separate key).
- **Passwords** — async scrypt, per-hash random salt, constant-time comparison.
- **Sessions** — random 256-bit tokens stored only as HMAC hashes; httpOnly/SameSite=Lax/Secure(prod) cookies; expired sessions purged hourly. The WebSocket layer authenticates with the same cookie and authorizes every channel subscription.
- **Rate limiting** (`src/lib/ratelimit.ts`) — login 10/min/IP, register 5/min/IP, invite redemption 10/min/IP, questionnaire 5/min/user, messages 30/10s/user. In-memory per instance (swap to Redis for exact global limits).
- **CSRF** — mutating `/api` requests with a mismatched `Origin` are rejected at the server before any handler runs, on top of SameSite=Lax cookies.
- **Headers** — X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS in production.
- **AuthZ** — role checks on every route; registration cannot create elevated roles; chat content readable only by the two participants; no account enumeration on login.
- **Env validation** — the server refuses to boot with missing/malformed keys, and refuses identical encryption/index keys in production.

Still needed before real patient data: KMS-managed keys with rotation, durable audit logging, real notification delivery (SMS/email), a strict CSP, backup/DR, and a HIPAA compliance review.

## Deployment

- `Dockerfile` (multi-stage) + `docker compose up -d db` for local Postgres.
- Run N app instances behind any load balancer (WebSocket-capable; sticky sessions not required).
- Deploy step: `npx prisma migrate deploy` before rolling instances.
- `GET /api/health` — DB-checked health endpoint for orchestrators.
- Graceful shutdown on SIGTERM (stops jobs, closes sockets, disconnects DB).

## Scripts

| Command | What |
| --- | --- |
| `npm run dev` | custom server, dev mode (Next HMR works through it) |
| `npm run build` / `npm start` | production build / production server |
| `npm test` | vitest suite (crypto, matching, availability, risk, invites, pubsub, rate limiter) |
| `npm run lint` | eslint |
| `npm run db:seed` | seed admin + AI providers + settings |

## Structure

```
server.ts         custom server: Next + WebSocket + background jobs + CSRF gate
src/server/       ws push layer (auth, channel authorization), env bootstrap
src/lib/          crypto, auth, matching, router, availability, invites, pubsub,
                  events, ratelimit, settings, AI responder
src/app/api/      auth, questionnaire, sessions, invite, provider, admin, health
src/app/          pages: landing, auth, questionnaire, chat, invite, provider, admin
src/components/   client components (chat room, dashboards, forms)
prisma/           schema (Postgres enums, partial unique index), migrations, seed
tests/            vitest unit tests
```
