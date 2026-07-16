# Clinician Connect Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI demo providers wait out the connect window (so a human can take over first) instead of connecting instantly, show a provider-agnostic waiting message, and record who ended each conversation.

**Architecture:** No new state machine. The existing PENDING → ACTIVE | EXPIRED | CLOSED flow, the `connectBy` deadline, and the background sweeper (`sweepExpiredSessions` in `server.ts`) already drive everything. We remove the instant AI accept from routing, add an AI branch at the deadline inside `expireAndRereoute`, make `aiAcceptSession` claim conditionally so a manual accept can win the race, and add one nullable FK for close attribution.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 + PostgreSQL, Vitest 4, Tailwind 4, TypeScript.

Spec: `docs/superpowers/specs/2026-07-16-clinician-connect-flow-design.md`

## Global Constraints

- **Do not change the connect window default.** `DEFAULT_CONNECT_WINDOW_MINUTES` stays `5` and stays admin-configurable via the `connectWindowMinutes` setting. `src/lib/settings.ts` is not touched by any task in this plan.
- **Every session state transition must use a conditional `updateMany` claim**, never an unconditional `update`. The `where` clause must include the status the transition is valid from. First writer wins; later writers no-op. This is the existing pattern in `src/app/api/sessions/[id]/accept/route.ts` and `expireAndRereoute`.
- **No PII crosses the pub/sub bus.** Events are refetch signals only (`src/lib/events.ts`). Never publish names, message bodies, or questionnaire content.
- **Tests are Vitest, `environment: "node"`, live in `tests/**/*.test.ts`**, and import source via the `@/` alias (mapped to `src/` in `vitest.config.ts`). Run with `npm test`.
- **Any test that transitively imports `@/lib/crypto` must set encryption keys in `beforeAll`:**
  ```ts
  beforeAll(() => {
    process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
  });
  ```
  `crypto.ts` reads these lazily inside functions, so `beforeAll` is early enough despite import hoisting. This is the existing pattern in `tests/pii.test.ts`.
- **Exact user-facing copy strings** (do not paraphrase):
  - Pending, user side: `A clinician is on their way`
  - Closed, ended by viewer: `You ended this conversation.`
  - Closed, ended by the other party: `` `${counterpartName} ended this conversation.` ``
  - Closed, no recorded closer (legacy rows): `This conversation has ended.`

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/ai-provider.ts` | Modify: `aiAcceptSession` claims conditionally, publishes session update | 1 |
| `tests/ai-provider.test.ts` | Create: race-safety of `aiAcceptSession` | 1 |
| `src/lib/router.ts` | Modify: AI providers wait; AI connects at deadline | 2 |
| `tests/router.test.ts` | Create: routing + deadline branching | 2 |
| `prisma/schema.prisma` + migration | Modify: `ChatSession.closedById` FK | 3 |
| `src/app/api/sessions/[id]/close/route.ts` | Modify: record `closedById` | 4 |
| `src/app/api/sessions/[id]/route.ts` | Modify: expose `closedBy` tri-state | 4 |
| `tests/close-session.test.ts` | Create: close route auth + attribution | 4 |
| `src/components/ChatRoom.tsx` | Modify: pending heading + ended-by copy | 5 |

Task order matters: Task 1 before Task 2 (the router's AI branch depends on `aiAcceptSession` being race-safe). Task 3 before Task 4 (the routes need the column to exist).

---

### Task 1: Make `aiAcceptSession` race-safe

Today `aiAcceptSession` does an unconditional `update` to ACTIVE and then always writes a greeting. Once Task 2 lands, it can be reached concurrently by the sweeper and by the lazy expiry inside the user's GET, and a human may have already accepted manually. Without a conditional claim we would resurrect a closed session and/or write duplicate greetings.

**Files:**
- Modify: `src/lib/ai-provider.ts:24-35` (the `aiAcceptSession` function and its imports)
- Test: `tests/ai-provider.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `aiAcceptSession(sessionId: string, aiUserId: string): Promise<void>` — unchanged signature. New behavior: returns without side effects if the session is not PENDING. Task 2 relies on this no-op guarantee.

- [ ] **Step 1: Write the failing test**

Create `tests/ai-provider.test.ts`:

```ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    chatSession: { updateMany: vi.fn(), findUnique: vi.fn() },
    message: { create: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/events", () => ({
  publishMessage: vi.fn(),
  publishSessionUpdate: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { publishMessage, publishSessionUpdate } from "@/lib/events";
import { aiAcceptSession } from "@/lib/ai-provider";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiAcceptSession", () => {
  it("claims the session conditionally on PENDING", async () => {
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);

    await aiAcceptSession("s1", "ai-user");

    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1", status: "PENDING" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
  });

  it("writes a greeting and publishes when it wins the claim", async () => {
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);

    await aiAcceptSession("s1", "ai-user");

    expect(prisma.message.create).toHaveBeenCalledOnce();
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "s1",
          senderId: "ai-user",
          // Encrypted at rest, never plaintext. Ciphertext format is
          // v1:<iv>:<authTag>:<ciphertext> (see src/lib/crypto.ts).
          bodyEnc: expect.stringMatching(/^v1:/),
        }),
      })
    );
    expect(publishSessionUpdate).toHaveBeenCalledWith("s1");
    expect(publishMessage).toHaveBeenCalledWith("s1");
  });

  it("no-ops when the session is no longer PENDING (human accepted first)", async () => {
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 0 } as never);

    await aiAcceptSession("s1", "ai-user");

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(publishMessage).not.toHaveBeenCalled();
    expect(publishSessionUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-provider.test.ts`

Expected: FAIL. The current implementation calls `prisma.chatSession.update` (not mocked → `TypeError: prisma.chatSession.update is not a function`), and the no-op test fails because a greeting is written unconditionally.

- [ ] **Step 3: Write the implementation**

In `src/lib/ai-provider.ts`, change the import line:

```ts
import { publishMessage, publishSessionUpdate } from "@/lib/events";
```

Replace the whole `aiAcceptSession` function with:

```ts
/**
 * Connect an AI demo provider to a session. Claims conditionally on PENDING:
 * a human manning the AI account may have accepted manually a moment ago, and
 * the sweeper and the user's lazy expiry can both reach the deadline at once.
 * Losing the claim is normal — return without writing a greeting rather than
 * resurrecting the session or talking over the human who took it.
 */
export async function aiAcceptSession(
  sessionId: string,
  aiUserId: string
): Promise<void> {
  const claimed = await prisma.chatSession.updateMany({
    where: { id: sessionId, status: "PENDING" },
    data: { status: "ACTIVE", acceptedAt: new Date() },
  });
  if (claimed.count === 0) return;

  await prisma.message.create({
    data: { sessionId, senderId: aiUserId, bodyEnc: encrypt(GREETING) },
  });
  await publishSessionUpdate(sessionId);
  await publishMessage(sessionId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai-provider.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Verify nothing else broke**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-provider.ts tests/ai-provider.test.ts
git commit -m "fix: make aiAcceptSession claim conditionally on PENDING

The sweeper, the user's lazy expiry, and a human manual accept can all
reach the same session. Claim with a conditional updateMany so the first
writer wins and the others no-op instead of writing duplicate greetings."
```

---

### Task 2: AI providers wait out the connect window

**Files:**
- Modify: `src/lib/router.ts:34-86` (`routeUserToProvider`) and `src/lib/router.ts:95-136` (`expireAndRereoute`)
- Test: `tests/router.test.ts` (create)

**Interfaces:**
- Consumes: `aiAcceptSession(sessionId, aiUserId)` from Task 1, including its no-op-when-not-PENDING guarantee.
- Produces: `routeUserToProvider(opts): Promise<ChatSession | null>` and `expireAndRereoute(sessionId): Promise<ChatSession>` — both signatures unchanged. `expireAndRereoute` now returns an ACTIVE session (same id) for AI providers rather than an EXPIRED one or a re-routed one.

- [ ] **Step 1: Write the failing test**

Create `tests/router.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    providerProfile: { findMany: vi.fn() },
    chatSession: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/availability", () => ({ syncScheduledAvailability: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getConnectWindowMinutes: vi.fn(async () => 5) }));
vi.mock("@/lib/notify", () => ({ pingProvider: vi.fn() }));
vi.mock("@/lib/ai-provider", () => ({ aiAcceptSession: vi.fn() }));
vi.mock("@/lib/pii", () => ({ getConcernsForQuestionnaire: vi.fn(async () => ["anxiety"]) }));
vi.mock("@/lib/events", () => ({
  publishProviderPing: vi.fn(),
  publishRerouted: vi.fn(),
  publishSessionUpdate: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { aiAcceptSession } from "@/lib/ai-provider";
import { publishRerouted } from "@/lib/events";
import { routeUserToProvider, expireAndRereoute } from "@/lib/router";

const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 60_000);

function pendingSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: "u1",
    providerId: "p1",
    questionnaireId: "q1",
    status: "PENDING",
    matchType: "MATCHED",
    connectBy: PAST,
    acceptedAt: null,
    closedAt: null,
    createdAt: new Date(),
    humanTakeover: false,
    questionnaire: { id: "q1", concernsEnc: "enc" },
    provider: { id: "p1", userId: "prov-user", isAI: false },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("routeUserToProvider", () => {
  it("leaves an AI provider's session PENDING instead of accepting instantly", async () => {
    vi.mocked(prisma.providerProfile.findMany).mockResolvedValue([
      { id: "p1", specialties: ["anxiety"], isAI: true, userId: "ai-user" },
    ] as never);
    vi.mocked(prisma.chatSession.create).mockResolvedValue(
      pendingSession({ connectBy: FUTURE, provider: { id: "p1", userId: "ai-user", isAI: true } }) as never
    );

    const session = await routeUserToProvider({
      userId: "u1",
      questionnaireId: "q1",
      concerns: ["anxiety"],
    });

    expect(session?.status).toBe("PENDING");
    expect(aiAcceptSession).not.toHaveBeenCalled();
  });
});

describe("expireAndRereoute", () => {
  it("connects an AI provider at the deadline instead of expiring", async () => {
    vi.mocked(prisma.chatSession.findUniqueOrThrow)
      .mockResolvedValueOnce(
        pendingSession({ provider: { id: "p1", userId: "ai-user", isAI: true } }) as never
      )
      .mockResolvedValueOnce(
        pendingSession({ status: "ACTIVE", provider: { id: "p1", userId: "ai-user", isAI: true } }) as never
      );

    const result = await expireAndRereoute("s1");

    expect(aiAcceptSession).toHaveBeenCalledWith("s1", "ai-user");
    expect(result.id).toBe("s1");
    expect(result.status).toBe("ACTIVE");
    // The AI path must not expire the session or re-route the user.
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
    expect(publishRerouted).not.toHaveBeenCalled();
  });

  it("expires and re-routes a human provider at the deadline", async () => {
    vi.mocked(prisma.chatSession.findUniqueOrThrow).mockResolvedValue(pendingSession() as never);
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.chatSession.findMany).mockResolvedValue([{ providerId: "p1" }] as never);
    vi.mocked(prisma.providerProfile.findMany).mockResolvedValue([
      { id: "p2", specialties: ["anxiety"], isAI: false, userId: "prov2" },
    ] as never);
    vi.mocked(prisma.chatSession.create).mockResolvedValue(
      pendingSession({
        id: "s2",
        providerId: "p2",
        connectBy: FUTURE,
        provider: { id: "p2", userId: "prov2", isAI: false },
      }) as never
    );

    const result = await expireAndRereoute("s1");

    expect(aiAcceptSession).not.toHaveBeenCalled();
    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1", status: "PENDING" } })
    );
    expect(result.id).toBe("s2");
    expect(publishRerouted).toHaveBeenCalledWith("s1", "s2");
    // The provider who missed the window is excluded from the retry pool.
    expect(prisma.providerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: ["p1"] } }),
      })
    );
  });

  it("does nothing before the deadline", async () => {
    vi.mocked(prisma.chatSession.findUniqueOrThrow).mockResolvedValue(
      pendingSession({ connectBy: FUTURE }) as never
    );

    const result = await expireAndRereoute("s1");

    expect(result.status).toBe("PENDING");
    expect(aiAcceptSession).not.toHaveBeenCalled();
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/router.test.ts`

Expected: FAIL on two tests — "leaves an AI provider's session PENDING" fails because routing still calls `aiAcceptSession` immediately, and "connects an AI provider at the deadline" fails because the AI session is expired and re-routed instead.

- [ ] **Step 3: Remove the instant accept from `routeUserToProvider`**

In `src/lib/router.ts`, inside the `try` block, delete these three lines:

```ts
      if (session.provider.isAI) {
        await aiAcceptSession(session.id, session.provider.userId);
      }
```

so the block reads:

```ts
      await pingProvider(session.provider, session.id, windowMinutes);
      await publishProviderPing(chosen.userId);

      // AI demo providers are routed exactly like humans and wait out the
      // connect window: the window is what gives a person manning the AI
      // account time to take over. The sweeper connects them at the deadline.
      await publishSessionUpdate(session.id);
      return session;
```

Keep the `aiAcceptSession` import — `expireAndRereoute` uses it in the next step.

Also update the function's doc comment: replace the sentence "AI demo providers accept immediately so the flow is testable end-to-end." with "AI demo providers wait out the window like humans and connect at the deadline (see expireAndRereoute), so a person manning the account can take over first."

- [ ] **Step 4: Add the AI branch to `expireAndRereoute`**

In `src/lib/router.ts`, change the fetch at the top of `expireAndRereoute` to include the provider:

```ts
  const session = await prisma.chatSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { questionnaire: true, provider: true },
  });
  if (session.status !== "PENDING" || session.connectBy > new Date()) {
    return session;
  }

  // AI demo providers connect at the deadline rather than expiring: the
  // window exists to give a human manning the account time to take over,
  // not to drop the user. aiAcceptSession claims conditionally, so if that
  // human already accepted, this no-ops and the session stays theirs.
  if (session.provider.isAI) {
    await aiAcceptSession(session.id, session.provider.userId);
    return prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
  }
```

Everything below (the `claimed` conditional update, the exclude-list build, the re-route, `publishRerouted`) stays exactly as it is.

Update the function's doc comment first line to: "Handle a PENDING session whose connect window has lapsed: AI providers connect, human providers expire and the user is re-routed to the next provider."

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/router.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify nothing else broke**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all suites pass, no type errors, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/router.ts tests/router.test.ts
git commit -m "feat: AI providers wait out the connect window

AI demo providers were accepting the instant they were routed, so a human
manning the account never had a chance to take over and the user never saw
the waiting state. Route them like humans and connect them at the deadline
from expireAndRereoute instead. A manual accept before the deadline wins."
```

---

### Task 3: Add `closedById` to the schema

**Files:**
- Modify: `prisma/schema.prisma` (the `User` and `ChatSession` models)
- Create: `prisma/migrations/<timestamp>_closed_by/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `ChatSession.closedById: string | null` on the generated Prisma client. Task 4 reads and writes it.

Nullable because EXPIRED sessions have no closer and rows predating this migration have no recorded one. `onDelete: SetNull` so deleting a user does not cascade away session history — the FK is attribution metadata, not ownership.

- [ ] **Step 1: Add the relation to the `User` model**

In `prisma/schema.prisma`, in `model User`, add one line to the relation block (after `messages Message[]`):

```prisma
  closedSessions  ChatSession[]    @relation("ClosedSessions")
```

A named relation is required: `User` already has `userSessions ChatSession[] @relation("UserSessions")`, so a second `User` ↔ `ChatSession` relation must be disambiguated by name.

- [ ] **Step 2: Add the field to the `ChatSession` model**

In `model ChatSession`, add after the `closedAt DateTime?` line:

```prisma
  // Who ended the chat. Null for EXPIRED sessions (nobody ended them) and for
  // rows closed before this column existed.
  closedById String?
  closedBy   User?    @relation("ClosedSessions", fields: [closedById], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name closed_by`

Expected: a new directory `prisma/migrations/<timestamp>_closed_by/` containing `migration.sql` with an `ALTER TABLE "ChatSession" ADD COLUMN "closedById" TEXT;` plus an `ADD CONSTRAINT ... ON DELETE SET NULL` foreign key. The Prisma client regenerates automatically.

- [ ] **Step 4: Verify the client picked up the field**

Run: `npx tsc --noEmit`
Expected: no type errors.

Then confirm the column exists:

Run: `npx prisma migrate status`
Expected: "Database schema is up to date!"

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: record who closed a chat session

Nullable FK with onDelete SetNull: EXPIRED sessions have no closer, and
attribution metadata should not cascade session history away with a user."
```

---

### Task 4: Record and expose who ended the conversation

The write side (`closedById`) and the read side (`closedBy`) ship together — the column is dead weight without the API exposing it, so a reviewer cannot meaningfully accept one and reject the other.

**Files:**
- Modify: `src/app/api/sessions/[id]/close/route.ts:33-36` (the `updateMany` call)
- Modify: `src/app/api/sessions/[id]/route.ts:64-79` (the GET response body)
- Test: `tests/close-session.test.ts` (create)

**Interfaces:**
- Consumes: `ChatSession.closedById` from Task 3.
- Produces: the session GET response gains `closedBy: "me" | "them" | null`. Task 5 renders it.

- [ ] **Step 1: Write the failing test**

Create `tests/close-session.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    chatSession: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/events", () => ({ publishSessionUpdate: vi.fn() }));

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { POST } from "@/app/api/sessions/[id]/close/route";

const params = Promise.resolve({ id: "s1" });

function activeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: "u1",
    providerId: "p1",
    status: "ACTIVE",
    closedById: null,
    provider: { id: "p1", userId: "prov-user", isAI: false },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sessions/[id]/close", () => {
  it("records the closing user's id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(activeSession() as never);
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);

    const res = await POST(new Request("http://test"), { params });

    expect(res.status).toBe(200);
    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1", status: { in: ["PENDING", "ACTIVE"] } },
        data: expect.objectContaining({ status: "CLOSED", closedById: "u1" }),
      })
    );
  });

  it("records the provider as closer when the provider ends it", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(activeSession() as never);
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);

    await POST(new Request("http://test"), { params });

    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ closedById: "prov-user" }),
      })
    );
  });

  it("rejects a non-participant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "stranger" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(activeSession() as never);

    const res = await POST(new Request("http://test"), { params });

    expect(res.status).toBe(403);
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new Request("http://test"), { params });

    expect(res.status).toBe(401);
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent on an already-closed session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      activeSession({ status: "CLOSED", closedById: "prov-user" }) as never
    );

    const res = await POST(new Request("http://test"), { params });

    expect(res.status).toBe(200);
    // Must not overwrite the original closer's attribution.
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/close-session.test.ts`

Expected: FAIL on the two attribution tests — `closedById` is not in the `data` object yet. The auth and idempotency tests pass already (that behavior exists); they are here as regression cover.

- [ ] **Step 3: Record the closer**

In `src/app/api/sessions/[id]/close/route.ts`, add `closedById` to the existing `updateMany`:

```ts
  await prisma.chatSession.updateMany({
    where: { id: session.id, status: { in: ["PENDING", "ACTIVE"] } },
    data: { status: "CLOSED", closedAt: new Date(), closedById: user.id },
  });
```

No other change — the early return for already-CLOSED/EXPIRED sessions above it already prevents overwriting an existing closer.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/close-session.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Expose the tri-state on the session GET**

In `src/app/api/sessions/[id]/route.ts`, add one field to the `NextResponse.json({...})` body, after the `aiTakeover` line:

```ts
    // Tri-state, not a boolean: rows closed before closedById existed have no
    // recorded closer, and a boolean would render that as "they ended it".
    closedBy:
      session.status !== "CLOSED" || !session.closedById
        ? null
        : session.closedById === user.id
          ? "me"
          : "them",
```

- [ ] **Step 6: Verify nothing else broke**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all suites pass, no type errors, no lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/sessions/[id]/close/route.ts src/app/api/sessions/[id]/route.ts tests/close-session.test.ts
git commit -m "feat: expose who ended a chat session

The close route records closedById; the session GET returns a me/them/null
tri-state. Null covers both not-closed and rows predating the column, so a
legacy session is never falsely attributed to the other participant."
```

---

### Task 5: Update the chat UI copy

Two copy changes in one file, both verified the same way (by driving the running app). There is no component test infrastructure in this repo — no jsdom, no React Testing Library, `vitest.config.ts` sets `environment: "node"` — so these are verified manually rather than by unit test. Do not add that infrastructure as part of this task.

**Files:**
- Modify: `src/components/ChatRoom.tsx` — the `SessionState` interface (~line 17), the PENDING user branch (~line 202), and the ended-chat footer (~line 321)

**Interfaces:**
- Consumes: `closedBy: "me" | "them" | null` from the session GET (Task 4).
- Produces: nothing downstream.

- [ ] **Step 1: Add `closedBy` to the client-side session type**

In `src/components/ChatRoom.tsx`, add one field to the `SessionState` interface, after `aiTakeover`:

```ts
  closedBy: "me" | "them" | null;
```

- [ ] **Step 2: Replace the pending heading with the provider-agnostic copy**

In the `session.status === "PENDING"` block, in the `viewerRole === "user"` branch, replace:

```tsx
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ink">
              Connecting you with {session.counterpartName}…
            </h1>
```

with:

```tsx
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ink">
              A clinician is on their way
            </h1>
```

No name before they accept: a provider who misses the window gets re-routed away, so naming them here is a promise we may not keep. The supporting paragraph and countdown below are already provider-agnostic — leave them. The provider-side branch of this block is unchanged.

- [ ] **Step 3: Add the ended-by helper**

In `src/components/ChatRoom.tsx`, add this module-level function next to `TypingIndicator` (above the `ChatRoom` component):

```tsx
function endedNote(session: SessionState): string {
  if (session.closedBy === "me") return "You ended this conversation.";
  if (session.closedBy === "them") {
    return `${session.counterpartName} ended this conversation.`;
  }
  return "This conversation has ended.";
}
```

- [ ] **Step 4: Render it in the ended-chat footer**

Replace the non-ACTIVE footer branch:

```tsx
        <div className="border-t border-edge/70 p-4 text-center text-sm text-ink-faint">
          This conversation has ended.
        </div>
```

with:

```tsx
        <div className="border-t border-edge/70 p-4 text-center text-sm text-ink-faint">
          {endedNote(session)}
        </div>
```

Leave the header subtitle (`"Secure chat — encrypted at rest"` / `"Chat ended"`) alone — attribution lives in one place, and the header has no room for a name.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: no type errors, no lint errors, all suites pass.

- [ ] **Step 6: Verify the full flow in the running app**

Start the app on a free port (port 3000 is occupied by an unrelated app):

Run: `PORT=3100 npm run dev`

Then, in a browser:

1. Log in as a regular user and submit the questionnaire so you get routed to the AI demo provider.
2. **Confirm the pending screen reads "A clinician is on their way"** with the breathing circle and a live countdown — and that it does *not* name the provider.
3. **Confirm the session stays PENDING for the full connect window** (5 minutes by default; to shorten the loop, set the window to 1 minute in the admin settings UI first). It must not jump straight to an active chat.
4. Wait out the window. **Confirm the AI connects** — the greeting message appears and the chat goes active. This is the sweeper's AI branch firing.
5. Repeat from step 1 in a fresh session, but this time log into the AI provider account in a second browser profile, open the pending chat, and click **Accept and join chat** before the deadline. **Confirm the human accept wins**: the chat goes active immediately, and no AI greeting appears when the deadline later passes.
6. End the chat from the user side. **Confirm the footer reads "You ended this conversation."** on the user's screen and "{user's name} ended this conversation." on the provider's screen.
7. In a fresh session, end the chat from the provider side and confirm the attribution is reversed.

Expected: every confirmation above holds. If step 3 connects instantly, Task 2's change to `routeUserToProvider` did not land. If step 5 shows a duplicate AI greeting, Task 1's conditional claim did not land.

- [ ] **Step 7: Commit**

```bash
git add src/components/ChatRoom.tsx
git commit -m "feat: provider-agnostic waiting copy, attribute who ended a chat

The pending screen named a provider who may still be re-routed away; it now
reads 'A clinician is on their way'. The ended-chat footer now says who
ended it, falling back to neutral copy for sessions with no recorded closer."
```

---

## Done When

- AI demo providers sit PENDING for the full connect window and connect at the deadline.
- A human manning an AI provider account can accept before the deadline and the AI never talks over them.
- The user's pending screen never names a provider before they accept.
- Both participants see who ended a finished conversation; legacy rows fall back to neutral copy.
- `npm test`, `npx tsc --noEmit`, and `npm run lint` are all clean.
- `src/lib/settings.ts` is untouched — `git diff main --stat` must not list it.
