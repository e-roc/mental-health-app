# Clinician Connect Flow — Design

Date: 2026-07-16
Status: Approved (pending implementation plan)

## Problem

Two gaps in the chat connect flow:

1. **AI demo providers connect instantly.** `routeUserToProvider` calls
   `aiAcceptSession` the moment it creates the session, so a session routed to
   an AI provider jumps straight to ACTIVE. There is no window in which a human
   manning that account can take over first, and the user never sees the
   "waiting for a clinician" state that a real routing produces.

2. **The pending screen names a provider who may not arrive.** It reads
   "Connecting you with {name}…" before that provider has accepted. If they miss
   the window we re-route to someone else, so the name is a promise we may break.

Additionally, when a conversation ends, neither participant can tell who ended
it — both sides see the same neutral "This conversation has ended."

## What Already Works (and stays untouched)

The backend already implements most of the desired behavior. This design
deliberately reuses it rather than adding a parallel path:

- `ChatSession` state machine: PENDING → ACTIVE | EXPIRED | CLOSED.
- `connectBy` deadline, set from the admin-configurable `connectWindowMinutes`
  setting (default 5).
- `expireAndRereoute` — on deadline miss, expire the session and re-route to the
  next-best provider, excluding every provider already tried for this
  questionnaire.
- `sweepExpiredSessions` — background sweeper (interval in `server.ts`) that
  drives deadlines server-side, independent of the user's browser.
- Conditional `updateMany` claims throughout, so concurrent workers can't
  double-transition a session.

**The connect window default is not changing.** It stays at 5 minutes and stays
admin-configurable. The "2 minutes" in the original request is expressed by
setting that admin value, not by editing code.

## Design

### 1. AI providers wait out the connect window

`src/lib/router.ts` — `routeUserToProvider`:

Remove the immediate `aiAcceptSession` call. AI-backed providers are now routed
exactly like humans: session created PENDING, provider pinged, `connectBy` set.
The user sees the waiting state for the full window.

`src/lib/router.ts` — `expireAndRereoute`:

Include `provider` in the session fetch. At the deadline, branch on
`provider.isAI`:

- **AI provider** → call `aiAcceptSession`. The session goes ACTIVE. This is the
  guaranteed connection: the user is never left with nobody.
- **Human provider** → today's behavior, unchanged. Expire, add to the exclude
  list, re-route to the next-best provider.

The AI branch returns the same session (now ACTIVE) rather than a re-routed one,
so `publishRerouted` is not fired for it.

### 2. Manual override needs no new code

A human authenticated as the AI provider account opens the pending chat. The
existing GET handler flips `humanTakeover`, permanently disabling canned
auto-replies for that session. They then click the existing **Accept and join
chat** button, which hits the existing generic `/accept` route.

If they accept before the deadline, the sweeper's later `aiAcceptSession` call
finds the session no longer PENDING and no-ops. If they don't, the sweeper
connects the AI at the deadline as the fallback.

### 3. `aiAcceptSession` becomes race-safe

`src/lib/ai-provider.ts`:

Currently an unconditional `update` to ACTIVE followed by a greeting message
write. Two callers can now reach the deadline concurrently (sweeper and a lazy
expiry from the user's GET), and a human manual-accept can land first. Change to
a conditional claim:

```
updateMany({ where: { id, status: "PENDING" }, data: { status: "ACTIVE", acceptedAt: now } })
```

If `count === 0`, return without writing a greeting. This prevents both a
duplicate greeting and an AI greeting landing in a session a human just took
over. Also publish `publishSessionUpdate` so the admin dashboard reflects the
transition.

### 4. Generic pending copy

`src/components/ChatRoom.tsx` — the user-side PENDING heading becomes
**"A clinician is on their way"**. No provider name is shown before they accept,
since a re-route may replace them. The countdown and supporting copy below are
already generic and stay as-is. The provider-side PENDING view is unchanged.

### 5. Show who ended the conversation

**Schema** (`prisma/schema.prisma`, new migration):

- `ChatSession.closedById String?` — optional FK to `User`, `onDelete: SetNull`.
  Optional because EXPIRED sessions have no closer, and `SetNull` so session
  history survives a user deletion.
- `User.closedSessions ChatSession[]` back-relation.

**`src/app/api/sessions/[id]/close/route.ts`**: set `closedById: user.id` in the
existing `updateMany` that transitions to CLOSED. No other logic changes.

**`src/app/api/sessions/[id]/route.ts`** (GET): return `closedByMe: boolean`
(`session.closedById === user.id`) when status is CLOSED. Reuses the existing
`counterpartName` field rather than adding a second name field.

**`src/components/ChatRoom.tsx`**: when status is CLOSED, the header subtitle and
footer read "You ended this conversation." or "{counterpartName} ended this
conversation." The EXPIRED branch is separate and untouched — nobody ends an
expired session.

Sessions closed before this migration have `closedById = null`; they fall back to
the current neutral "This conversation has ended."

## Error Handling & Concurrency

Every new transition uses the same conditional-claim pattern already established
in `accept/route.ts` and `expireAndRereoute`: first writer wins, later writers
no-op. No new locks, safe across instances.

Races covered:

- Manual accept vs. sweeper AI-accept → manual wins, sweeper no-ops.
- Sweeper vs. user-GET lazy expiry, both hitting the deadline → one claims, the
  other reads current state.
- Close vs. AI-accept at the deadline → the close claim requires status
  PENDING/ACTIVE, the AI claim requires PENDING; whichever lands first wins and
  the other's `where` no longer matches.

## Testing

The repo's convention is pure-logic unit tests under `tests/`; there are no DB
integration tests and no jsdom/RTL setup. New tests follow that convention,
mocking `@/lib/db`:

- `expireAndRereoute` with an AI provider past the deadline → `aiAcceptSession`
  fires, session goes ACTIVE, no re-route.
- `expireAndRereoute` with a human provider past the deadline → expire +
  exclude + re-route, unchanged from today.
- `routeUserToProvider` with an AI provider → session left PENDING, no greeting
  written.
- `aiAcceptSession` when the session is no longer PENDING → no-op, no duplicate
  greeting message.
- `close` route → `closedById` persisted on the CLOSED transition.

`ChatRoom.tsx` copy changes are not unit-tested (no component test
infrastructure exists); they are verified by driving the flow in the running app.

## Files Touched

| File | Change |
|---|---|
| `prisma/schema.prisma` + migration | `closedById` FK, `closedSessions` relation |
| `src/lib/router.ts` | AI providers wait; AI branch at deadline |
| `src/lib/ai-provider.ts` | Race-safe conditional claim; publish update |
| `src/app/api/sessions/[id]/close/route.ts` | Record `closedById` |
| `src/app/api/sessions/[id]/route.ts` | Return `closedByMe` |
| `src/components/ChatRoom.tsx` | Generic pending heading; who-ended-it copy |
| `tests/router.test.ts`, `tests/ai-provider.test.ts`, `tests/close-session.test.ts` (new) | Coverage above |

Explicitly **not** changed: `src/lib/settings.ts` — the connect window default
stays 5 and stays admin-configurable.
