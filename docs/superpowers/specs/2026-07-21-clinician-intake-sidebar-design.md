# Clinician intake sidebar — design

**Date:** 2026-07-21
**Branch:** clinician-connect-flow

## Context

A clinician (role `PROVIDER`) chats with a patient (role `USER`) at `/chat/[id]`, where
`[id]` is the `ChatSession` id. The chat UI (`src/components/ChatRoom.tsx`) is a single
centered card and surfaces nothing about *why* the patient reached out.

The patient's intake answers already exist: the `Questionnaire` model stores encrypted
answers (`answersEnc`), and `ChatSession.questionnaireId` links each session to the intake
that spawned it. But **no provider-facing UI shows those answers today** — only the patient
sees their own answers; admins see a derived `riskLevel` badge only.

This feature adds a collapsible sidebar beside the chat, visible **only to the clinician**,
showing the intake tied to the current session so they can provide better-informed care.
It newly exposes decrypted intake PII to the assigned provider — an intentional, scoped
expansion of who can read that data.

## Decisions (locked with user)

- **Data source:** the questionnaire linked to *this session* (`session.questionnaireId`),
  full decrypted answers. Not "patient's latest overall."
- **History:** latest only — one questionnaire, no trend list.
- **Default state:** expanded; collapse choice persisted per-clinician in `localStorage`.
- **Endpoint access:** either session participant (provider or the session's patient),
  mirroring the existing participant guard.
- **Empty state:** `session.questionnaireId` is optional → render "No intake on file."

## Architecture — three pieces

### 1. API route — `src/app/api/sessions/[id]/questionnaire/route.ts` (GET)

New route, patterned on `src/app/api/sessions/[id]/route.ts`:

- `const { id } = await params` (Next 16 async params).
- `getCurrentUser()` → `401 { error: "Unauthorized" }` if none.
- Load session with the questionnaire relation:
  `prisma.chatSession.findUnique({ where: { id }, include: { provider: true, questionnaire: true } })`.
  → `404 { error: "Not found" }` if missing. (`provider` alone gives `provider.userId`; no
  need to include `provider.user` or `user`.)
- Participant guard (mirror `sessions/[id]/route.ts:30-34`):
  `isUser = session.userId === user.id`, `isProvider = session.provider.userId === user.id`;
  neither → `403 { error: "Forbidden" }`.
- If `!session.questionnaire` → `200 { questionnaire: null }`.
- Else decrypt via `getAnswersForQuestionnaire(session.questionnaire)` (`src/lib/pii.ts`).
  - Decrypt failure returns `null` (per that helper) → surface as
    `200 { questionnaire: { answers: null, riskLevel, createdAt } }` so the client can show an
    "unreadable" state distinct from "no intake."
  - Success → `200 { questionnaire: { answers, riskLevel: session.questionnaire.riskLevel, createdAt: session.questionnaire.createdAt } }`.

Decryption lives **only** on this endpoint, fetched once when the sidebar mounts — it is
**not** added to the frequently-polled `sessions/[id]` GET.

### 2. Label maps — `src/lib/questionnaire.ts` (DRY refactor)

`FREQUENCY_LABELS` currently lives inline in `QuestionnaireForm.tsx:13-18`. Lift it into
`questionnaire.ts` as an exported constant and import it back into the form (no behavior
change). Add sibling exported maps the sidebar needs for readable rendering:

- `FREQUENCY_LABELS` (moved): `not-at-all` → "Not at all", etc.
- `SLEEP_LABELS`: `good`/`fair`/`poor` → "Good"/"Fair"/"Poor".
- `YES_NO_LABELS`: `yes`/`no` → "Yes"/"No".
- `FIELD_LABELS`: short sidebar headings per answer field, e.g.
  `moodFrequency` → "Low mood", `anxietyFrequency` → "Anxiety", `sleepQuality` → "Sleep",
  `priorSupport` → "Prior support", `safetyConcern` → "Safety concern",
  `additionalNotes` → "Notes". (Sidebar uses these short labels, not the form's long
  clinical question text.)

`CONCERN_LABELS` already exists and is reused as-is.

### 3. Component — `src/components/IntakeSidebar.tsx` (client)

- `"use client"`, prop `{ sessionId: string }`.
- On mount: `fetch(\`/api/sessions/${sessionId}/questionnaire\`, { cache: "no-store" })`, once.
  Questionnaire rows are immutable, so no `useRealtime`/`usePoll`.
- Local `useState` for `data | null`, `loading`, `error` — mirrors `ProviderDashboard.tsx`
  fetch/error/empty conventions.
- Collapse state: `useState` seeded from `localStorage` key `intake-sidebar-collapsed`
  (default expanded = not collapsed); write back on toggle. Guard `localStorage` access for
  SSR (read in an effect / `typeof window` check).
- Render states:
  - **loading** — "Loading intake…"
  - **error** (`!res.ok`) — `errorText` "Unable to load intake"
  - **empty** (`questionnaire === null`) — "No intake on file"
  - **unreadable** (`questionnaire.answers === null`) — "Intake is unreadable" + risk pill
  - **loaded** — risk-level `pill` (color by LOW/MODERATE/HIGH), submitted date
    (`createdAt`), concerns as tags via `CONCERN_LABELS`, then each answer field via
    `FIELD_LABELS` + the matching value-label map; `additionalNotes` free-text shown when
    non-empty.
- **Collapsed** — thin vertical strip (~`w-10`) with a toggle button (chevron + "Intake"),
  same height as the chat card.
- Styling: Tailwind spa palette + `src/lib/ui.ts` tokens (`pill`, `card`, `errorText`,
  `sectionTitle`). No new global CSS.

### Layout wiring — `src/components/ChatRoom.tsx`

The main chat card return (`ChatRoom.tsx:267`) currently is
`<div className="rise mx-auto flex h-[70vh] max-w-2xl flex-col …">`. Wrap that card and the
sidebar in a horizontal flex row, rendering `<IntakeSidebar>` **only when
`session.viewerRole === "provider"`**:

```
<div className="mx-auto flex max-w-5xl items-start justify-center gap-4">
  {/* existing chat card — drop its own mx-auto; keep max-w-2xl flex-1 */}
  {session.viewerRole === "provider" && <IntakeSidebar sessionId={session.id} />}
</div>
```

- Sidebar expanded width ~`w-80`; collapsed ~`w-10`. Chat card keeps `max-w-2xl`.
- Only the primary card return (covers ACTIVE and normally-closed sessions via its footer
  ternary) is wrapped. The earlier waiting / expired-reroute returns
  (`ChatRoom.tsx` ~248-265) are patient-centric and left unchanged.
- Patient view (`viewerRole === "user"`) renders exactly as today.

## Data flow

```
provider opens /chat/[id]
  → ChatRoom fetches /api/sessions/[id]  (existing; unchanged)
  → viewerRole === "provider" → mounts IntakeSidebar
      → fetches /api/sessions/[id]/questionnaire  (new, once)
          → participant guard → decrypt session.questionnaire → JSON
      → renders intake, respecting persisted collapse state
```

## Testing

`tests/session-questionnaire-get.test.ts` (Vitest, API-handler style — clone
`tests/session-get.test.ts` scaffold: `vi.mock` `@/lib/db`, `@/lib/auth`, `@/lib/pii`):

1. No user → `401`.
2. Session not found → `404`.
3. Caller is neither participant → `403`.
4. Provider participant, session has questionnaire → `200`, body carries decrypted
   `answers` + `riskLevel` + `createdAt`; assert `getAnswersForQuestionnaire` invoked.
5. Patient participant (own session) → `200` (access allowed).
6. `questionnaireId` null / no questionnaire relation → `200 { questionnaire: null }`;
   assert decrypt **not** invoked.
7. Decrypt returns `null` → `200 { questionnaire: { answers: null, riskLevel, createdAt } }`.

No component render tests — the repo has none (Vitest `environment: "node"`, no jsdom).

## Verification (end-to-end)

1. `npx vitest run tests/session-questionnaire-get.test.ts` — all green.
2. `npx tsc --noEmit` (or project typecheck) — no type errors from the new route/component/labels.
3. `PORT=3100 npm run dev`; log in as a provider, open an active chat that has a linked
   questionnaire → sidebar shows intake, expanded by default.
4. Collapse it, reload → stays collapsed (localStorage). Expand, reload → stays expanded.
5. Open a chat whose session has no `questionnaireId` → "No intake on file."
6. Open the same chat as the patient → **no sidebar** (provider-only render).

## Out of scope (YAGNI)

- Questionnaire history / trend view (latest only).
- Live/realtime refresh of intake (rows are immutable).
- Editing intake from the sidebar.
- Redacting free-text — full answers shown to the assigned provider by decision.
