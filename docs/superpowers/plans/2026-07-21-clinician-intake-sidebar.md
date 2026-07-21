# Clinician Intake Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a clinician (role `PROVIDER`) a collapsible sidebar beside the chat that shows the patient's intake questionnaire for the current session.

**Architecture:** A new participant-guarded GET route decrypts the session's linked `Questionnaire` and returns it as JSON. A client `IntakeSidebar` component fetches it once and renders it beside the chat, visible only to the provider viewer, with collapse state persisted in `localStorage`. Shared label maps move into `questionnaire.ts` so the intake form and the sidebar render option values identically.

**Tech Stack:** Next.js 16 (App Router), React client components, Prisma, Tailwind CSS v4, Vitest (node env).

## Global Constraints

- Read the relevant guide in `node_modules/next/dist/docs/` before writing route/component code — this Next.js has breaking changes vs. training data. Dynamic route params are async: `{ params }: { params: Promise<{ id: string }> }`, then `await params`.
- Decryption of intake answers happens ONLY on the new endpoint — never add it to the polled `sessions/[id]` GET.
- Sidebar renders only when `session.viewerRole === "provider"`. Patient view unchanged.
- Styling via Tailwind spa-palette utilities + `src/lib/ui.ts` tokens. No new global CSS. Palette tokens available: `mist, surface, ink, ink-soft, ink-faint, edge, fern, fern-deep, fern-mist, clay, clay-mist, moss, moss-mist, rose, rose-mist`.
- Tests are flat files under `tests/*.test.ts`, Vitest, `vi.mock` + direct handler import. No component render tests exist (node env, no jsdom) — sidebar/wiring verified manually.

---

## File Structure

- `src/lib/questionnaire.ts` (modify) — add shared label maps (`FREQUENCY_LABELS` moved here, plus `SLEEP_LABELS`, `YES_NO_LABELS`, `FIELD_LABELS`).
- `src/components/QuestionnaireForm.tsx` (modify) — import `FREQUENCY_LABELS` instead of defining it inline.
- `src/app/api/sessions/[id]/questionnaire/route.ts` (create) — GET, participant-guarded, decrypts session's intake.
- `src/components/IntakeSidebar.tsx` (create) — client sidebar.
- `src/components/ChatRoom.tsx` (modify) — wrap chat card + sidebar in a flex row, gated on provider.
- `tests/questionnaire-labels.test.ts` (create) — label-map completeness.
- `tests/session-questionnaire-get.test.ts` (create) — route behavior.

---

## Task 1: Shared intake label maps

**Files:**
- Modify: `src/lib/questionnaire.ts`
- Modify: `src/components/QuestionnaireForm.tsx:13-18` (remove inline map), `:8` (add import)
- Test: `tests/questionnaire-labels.test.ts`

**Interfaces:**
- Produces: `FREQUENCY_LABELS: Record<(typeof FREQUENCY_OPTIONS)[number], string>`, `SLEEP_LABELS: Record<"good"|"fair"|"poor", string>`, `YES_NO_LABELS: Record<"yes"|"no", string>`, `FIELD_LABELS: Record<keyof Omit<QuestionnaireAnswers, "concerns">, string>` — all exported from `@/lib/questionnaire`.

- [ ] **Step 1: Write the failing test**

Create `tests/questionnaire-labels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  FREQUENCY_OPTIONS,
  FREQUENCY_LABELS,
  SLEEP_LABELS,
  YES_NO_LABELS,
  FIELD_LABELS,
} from "@/lib/questionnaire";

describe("questionnaire label maps", () => {
  it("labels every frequency option", () => {
    for (const opt of FREQUENCY_OPTIONS) {
      expect(FREQUENCY_LABELS[opt]).toBeTruthy();
    }
  });

  it("labels sleep, yes/no, and every answer field", () => {
    expect(Object.keys(SLEEP_LABELS).sort()).toEqual(["fair", "good", "poor"]);
    expect(Object.keys(YES_NO_LABELS).sort()).toEqual(["no", "yes"]);
    expect(FIELD_LABELS.moodFrequency).toBeTruthy();
    expect(FIELD_LABELS.anxietyFrequency).toBeTruthy();
    expect(FIELD_LABELS.sleepQuality).toBeTruthy();
    expect(FIELD_LABELS.priorSupport).toBeTruthy();
    expect(FIELD_LABELS.safetyConcern).toBeTruthy();
    expect(FIELD_LABELS.additionalNotes).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/questionnaire-labels.test.ts`
Expected: FAIL — `FREQUENCY_LABELS` (and siblings) are not exported.

- [ ] **Step 3: Add the label maps**

In `src/lib/questionnaire.ts`, after the `QuestionnaireAnswers` type (line 59), add:

```ts
/**
 * Human-readable labels for answer values and fields — shared by the intake
 * form and the provider-facing intake sidebar so both render values identically.
 */
export const FREQUENCY_LABELS: Record<
  (typeof FREQUENCY_OPTIONS)[number],
  string
> = {
  "not-at-all": "Not at all",
  "several-days": "Several days",
  "more-than-half": "More than half the days",
  "nearly-every-day": "Nearly every day",
};

export const SLEEP_LABELS: Record<"good" | "fair" | "poor", string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};

export const YES_NO_LABELS: Record<"yes" | "no", string> = {
  yes: "Yes",
  no: "No",
};

/** Short headings for each answer field in compact summaries (e.g. the sidebar). */
export const FIELD_LABELS: Record<
  keyof Omit<QuestionnaireAnswers, "concerns">,
  string
> = {
  moodFrequency: "Low mood",
  anxietyFrequency: "Anxiety",
  sleepQuality: "Sleep",
  priorSupport: "Prior support",
  safetyConcern: "Safety concern",
  additionalNotes: "Notes",
};
```

- [ ] **Step 4: De-duplicate the form's inline map**

In `src/components/QuestionnaireForm.tsx`, delete the local `FREQUENCY_LABELS` (lines 13-18) and add `FREQUENCY_LABELS` to the existing import from `@/lib/questionnaire` (line 5-10):

```tsx
import {
  CONCERN_LABELS,
  CONCERN_TAGS,
  FREQUENCY_LABELS,
  FREQUENCY_OPTIONS,
  type QuestionnaireAnswers,
} from "@/lib/questionnaire";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/questionnaire-labels.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (confirms the form still resolves `FREQUENCY_LABELS`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/questionnaire.ts src/components/QuestionnaireForm.tsx tests/questionnaire-labels.test.ts
git commit -m "refactor: share intake label maps for form and sidebar"
```

---

## Task 2: Intake questionnaire API route

**Files:**
- Create: `src/app/api/sessions/[id]/questionnaire/route.ts`
- Test: `tests/session-questionnaire-get.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (`@/lib/auth`), `prisma` (`@/lib/db`), `getAnswersForQuestionnaire` (`@/lib/pii`).
- Produces: `GET(_req: Request, ctx: { params: Promise<{ id: string }> })`. Response bodies:
  - `401 { error: "Unauthorized" }`, `404 { error: "Not found" }`, `403 { error: "Forbidden" }`
  - `200 { questionnaire: null }` when no linked intake
  - `200 { questionnaire: { answers: QuestionnaireAnswers | null, riskLevel: "LOW"|"MODERATE"|"HIGH", createdAt: Date } }`

- [ ] **Step 1: Write the failing test**

Create `tests/session-questionnaire-get.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { chatSession: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/pii", () => ({ getAnswersForQuestionnaire: vi.fn() }));

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAnswersForQuestionnaire } from "@/lib/pii";
import { GET } from "@/app/api/sessions/[id]/questionnaire/route";

const params = Promise.resolve({ id: "s1" });

const ANSWERS = {
  concerns: ["anxiety"],
  moodFrequency: "several-days",
  anxietyFrequency: "several-days",
  sleepQuality: "fair",
  priorSupport: "no",
  safetyConcern: "no",
  additionalNotes: "",
};

// Session participants: patient "u1", provider account "prov-user".
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: "u1",
    provider: { userId: "prov-user" },
    questionnaireId: "q1",
    questionnaire: {
      id: "q1",
      riskLevel: "MODERATE",
      createdAt: new Date("2026-07-20T00:00:00Z"),
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/sessions/[id]/questionnaire", () => {
  it("401 when no current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as never);
    const res = await GET(new Request("http://test"), { params });
    expect(res.status).toBe(401);
  });

  it("404 when the session is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(null as never);
    const res = await GET(new Request("http://test"), { params });
    expect(res.status).toBe(404);
  });

  it("403 when caller is neither participant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "stranger" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession() as never
    );
    const res = await GET(new Request("http://test"), { params });
    expect(res.status).toBe(403);
    expect(getAnswersForQuestionnaire).not.toHaveBeenCalled();
  });

  it("200 with decrypted answers for the provider participant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession() as never
    );
    vi.mocked(getAnswersForQuestionnaire).mockResolvedValue(ANSWERS as never);

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.questionnaire.answers).toEqual(ANSWERS);
    expect(body.questionnaire.riskLevel).toBe("MODERATE");
    expect(body.questionnaire.createdAt).toBeTruthy();
    expect(getAnswersForQuestionnaire).toHaveBeenCalledOnce();
  });

  it("200 for the patient participant (own session)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession() as never
    );
    vi.mocked(getAnswersForQuestionnaire).mockResolvedValue(ANSWERS as never);

    const res = await GET(new Request("http://test"), { params });
    expect(res.status).toBe(200);
  });

  it("200 { questionnaire: null } and no decrypt when session has no intake", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession({ questionnaireId: null, questionnaire: null }) as never
    );

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.questionnaire).toBeNull();
    expect(getAnswersForQuestionnaire).not.toHaveBeenCalled();
  });

  it("200 with answers:null when decrypt is unreadable", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession() as never
    );
    vi.mocked(getAnswersForQuestionnaire).mockResolvedValue(null as never);

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.questionnaire.answers).toBeNull();
    expect(body.questionnaire.riskLevel).toBe("MODERATE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/session-questionnaire-get.test.ts`
Expected: FAIL — cannot import `GET` from a route that doesn't exist.

- [ ] **Step 3: Write the route**

Create `src/app/api/sessions/[id]/questionnaire/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAnswersForQuestionnaire } from "@/lib/pii";

/**
 * The intake questionnaire linked to a chat session. Either participant (the
 * patient or the assigned provider) may read it. Decryption of the answers
 * lives here alone — it is intentionally not part of the polled session GET.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: { provider: true, questionnaire: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isUser = session.userId === user.id;
  const isProvider = session.provider.userId === user.id;
  if (!isUser && !isProvider) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session.questionnaire) {
    return NextResponse.json({ questionnaire: null });
  }

  const answers = await getAnswersForQuestionnaire(session.questionnaire);
  return NextResponse.json({
    questionnaire: {
      answers,
      riskLevel: session.questionnaire.riskLevel,
      createdAt: session.questionnaire.createdAt,
    },
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/session-questionnaire-get.test.ts`
Expected: PASS (all 7 cases).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/sessions/[id]/questionnaire/route.ts tests/session-questionnaire-get.test.ts
git commit -m "feat: intake questionnaire endpoint for a chat session"
```

---

## Task 3: IntakeSidebar component

**Files:**
- Create: `src/components/IntakeSidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/sessions/[id]/questionnaire` (Task 2); label maps + `type QuestionnaireAnswers` (`@/lib/questionnaire`); `pill`, `errorText` (`@/lib/ui`).
- Produces: `export function IntakeSidebar({ sessionId }: { sessionId: string })`.

No unit test (repo has no component-render harness). Verified manually in Task 4.

- [ ] **Step 1: Write the component**

Create `src/components/IntakeSidebar.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  CONCERN_LABELS,
  FIELD_LABELS,
  FREQUENCY_LABELS,
  SLEEP_LABELS,
  YES_NO_LABELS,
  type QuestionnaireAnswers,
} from "@/lib/questionnaire";
import { errorText, pill } from "@/lib/ui";

type Intake = {
  answers: QuestionnaireAnswers | null;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  createdAt: string;
};

const RISK_PILL: Record<Intake["riskLevel"], string> = {
  LOW: "bg-moss-mist text-moss",
  MODERATE: "bg-clay-mist text-clay",
  HIGH: "bg-rose-mist text-rose",
};

const STORAGE_KEY = "intake-sidebar-collapsed";

export function IntakeSidebar({ sessionId }: { sessionId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  // undefined = loading, null = no intake on file, Intake = loaded.
  const [intake, setIntake] = useState<Intake | null | undefined>(undefined);
  const [error, setError] = useState(false);

  // Seed collapse from localStorage after mount to avoid an SSR mismatch.
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/sessions/${sessionId}/questionnaire`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        if (active) setIntake(data.questionnaire);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        aria-label="Show patient intake"
        className="flex h-[70vh] w-10 shrink-0 flex-col items-center gap-2 rounded-3xl border border-edge/70 bg-surface py-4 text-ink-soft transition-colors hover:text-fern-deep"
      >
        <span aria-hidden>›</span>
        <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl]">
          Intake
        </span>
      </button>
    );
  }

  return (
    <aside className="flex h-[70vh] w-80 shrink-0 flex-col overflow-hidden rounded-3xl border border-edge/70 bg-surface">
      <div className="flex items-center justify-between border-b border-edge/70 px-5 py-4">
        <p className="font-serif text-lg font-semibold text-ink">
          Patient intake
        </p>
        <button
          onClick={toggle}
          aria-label="Hide patient intake"
          className="text-ink-soft transition-colors hover:text-fern-deep"
        >
          ‹
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
        {error ? (
          <p className={errorText}>Unable to load intake</p>
        ) : intake === undefined ? (
          <p className="text-ink-faint">Loading intake…</p>
        ) : intake === null ? (
          <p className="text-ink-faint">No intake on file</p>
        ) : (
          <IntakeBody intake={intake} />
        )}
      </div>
    </aside>
  );
}

function IntakeBody({ intake }: { intake: Intake }) {
  const { answers, riskLevel, createdAt } = intake;
  return (
    <>
      <div className="flex items-center justify-between">
        <span className={`${pill} ${RISK_PILL[riskLevel]}`}>
          {riskLevel} risk
        </span>
        <span className="text-xs text-ink-faint">
          {new Date(createdAt).toLocaleDateString()}
        </span>
      </div>

      {answers === null ? (
        <p className="text-ink-faint">Intake is unreadable</p>
      ) : (
        <>
          <Field label="Concerns">
            <div className="flex flex-wrap gap-1.5">
              {answers.concerns.map((c) => (
                <span key={c} className={`${pill} bg-fern-mist text-fern-deep`}>
                  {CONCERN_LABELS[c]}
                </span>
              ))}
            </div>
          </Field>
          <Field label={FIELD_LABELS.moodFrequency}>
            {FREQUENCY_LABELS[answers.moodFrequency]}
          </Field>
          <Field label={FIELD_LABELS.anxietyFrequency}>
            {FREQUENCY_LABELS[answers.anxietyFrequency]}
          </Field>
          <Field label={FIELD_LABELS.sleepQuality}>
            {SLEEP_LABELS[answers.sleepQuality]}
          </Field>
          <Field label={FIELD_LABELS.priorSupport}>
            {YES_NO_LABELS[answers.priorSupport]}
          </Field>
          <Field label={FIELD_LABELS.safetyConcern}>
            {YES_NO_LABELS[answers.safetyConcern]}
          </Field>
          {answers.additionalNotes.trim() && (
            <Field label={FIELD_LABELS.additionalNotes}>
              <p className="whitespace-pre-wrap text-ink-soft">
                {answers.additionalNotes}
              </p>
            </Field>
          )}
        </>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <div className="mt-1 text-ink">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`CONCERN_LABELS[c]` type-checks because `answers.concerns` is `ConcernTag[]`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/IntakeSidebar.tsx
git commit -m "feat: IntakeSidebar component"
```

---

## Task 4: Wire the sidebar into ChatRoom (provider only)

**Files:**
- Modify: `src/components/ChatRoom.tsx` (imports; main return at `:267-268` and its close at `:334`)

**Interfaces:**
- Consumes: `IntakeSidebar` (Task 3), existing `session.viewerRole`, `session.id`.

- [ ] **Step 1: Import the sidebar**

In `src/components/ChatRoom.tsx`, add near the other component/lib imports at the top:

```tsx
import { IntakeSidebar } from "@/components/IntakeSidebar";
```

- [ ] **Step 2: Wrap the chat card and add the sidebar**

Change the opening of the main return. Replace `ChatRoom.tsx:267-268`:

```tsx
  return (
    <div className="rise mx-auto flex h-[70vh] max-w-2xl flex-col overflow-hidden rounded-3xl border border-edge/70 bg-surface shadow-[0_30px_70px_-40px_rgba(34,51,44,0.4)]">
```

with:

```tsx
  return (
    <div className="mx-auto flex max-w-5xl items-start justify-center gap-4">
      <div className="rise flex h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-edge/70 bg-surface shadow-[0_30px_70px_-40px_rgba(34,51,44,0.4)]">
```

Then change the matching close of that block at `ChatRoom.tsx:334`. Replace:

```tsx
    </div>
  );
}
```

with:

```tsx
      </div>
      {session.viewerRole === "provider" && (
        <IntakeSidebar sessionId={session.id} />
      )}
    </div>
  );
}
```

(The inner chat-card `</div>` gains one indent level; the new outer `</div>` closes the flex row.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass (nothing regressed).

- [ ] **Step 5: Manual end-to-end verification**

Start the app: `PORT=3100 npm run dev`. Then:
1. Log in as a provider; open an active chat whose session has a linked questionnaire → sidebar visible on the right, expanded, showing risk pill + concerns + answer fields.
2. Collapse it (‹), reload → stays collapsed as a thin "Intake" strip. Expand (›), reload → stays expanded.
3. Open a chat whose session has no `questionnaireId` → "No intake on file".
4. Open the same chat as the patient (role USER) → no sidebar; chat looks exactly as before.

- [ ] **Step 6: Commit**

```bash
git add src/components/ChatRoom.tsx
git commit -m "feat: show intake sidebar beside chat for providers"
```

---

## Verification (whole feature)

1. `npx vitest run` — all green (label maps + route + existing suite).
2. `npx tsc --noEmit` — clean.
3. Manual flow from Task 4 Step 5 passes all four checks.
```
