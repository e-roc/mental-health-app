# Provider Initial Message on Connect — Design

**Date:** 2026-07-21
**Status:** Approved for planning

## Summary

Give a human provider an editable initial message on the "Accept and join chat"
screen, prefilled with an app-wide default. When the provider accepts, the
message is sent as their first chat message atomically with the session becoming
`ACTIVE`. Joining is blocked unless the message box is non-empty.

## Motivation

Today a human provider joins a chat to an empty room; the patient sees the
status flip to active with no greeting. AI demo providers already send a canned
`GREETING` on connect (`src/lib/ai-provider.ts:13`, written in
`aiAcceptSession` at `:49-53`). This brings the same warm-open to human
providers, while letting them tailor the wording per chat.

## Scope

- **In scope:** human provider accept flow — `accept/route.ts`, the provider
  PENDING branch of `ChatRoom.tsx`, one shared greeting constant, tests.
- **Out of scope:** AI providers (already send their own greeting via a
  separate path — untouched); per-provider saved/custom defaults; editing the
  greeting after join (it is a normal message once sent).

## Design

### Default text

- New shared constant `DEFAULT_PROVIDER_GREETING` in a new client-safe module
  (e.g. `src/lib/greeting.ts`) so both the client component and the server route
  can import it. It cannot live in `ai-provider.ts` (that module imports
  prisma/crypto and is server-only).
- App-wide, global. Not per-provider.

### UI — `ChatRoom.tsx`, provider PENDING branch (`:224-241`)

- Add a `<textarea>` above the "Accept and join chat" button, initialized to
  `DEFAULT_PROVIDER_GREETING`, fully editable. Back it with local state
  (a `useState` seeded from the constant).
- The Accept button is `disabled` when `busy` **or** the trimmed textarea value
  is empty (block-join rule, client side).
- `accept()` (`:164`) sends the message in the POST body:
  `body: JSON.stringify({ message })`, with `Content-Type: application/json`.
  (Currently it posts no body.)

### API — `accept/route.ts`

- Parse and validate the request body with a Zod schema matching the existing
  message bounds: `z.object({ message: z.string().trim().min(1).max(4000) })`.
  Missing/empty/whitespace-only → **400 Invalid message**. Over 4000 chars →
  **400**. Validate this *before* mutating anything.
- **Atomicity:** replace the standalone conditional `updateMany` at `:47-50`
  with a `prisma.$transaction` that:
  1. runs the same guarded `updateMany` (`where: { id, status: "PENDING" }`,
     `data: { status: "ACTIVE", acceptedAt: now }`),
  2. if `count === 0` → throw/abort so the transaction rolls back and the route
     returns the existing **409** ("Session is no longer pending") with **no
     message written**,
  3. otherwise `prisma.message.create({ data: { sessionId, senderId: user.id,
     bodyEnc: encrypt(message) } })`.
- After the transaction commits: `await publishSessionUpdate(id)` then
  `await publishMessage(id)` (mirrors `aiAcceptSession` at `:52-53`).
- The message is attributed to the provider purely via `senderId = user.id` —
  no message role/type field exists or is needed (matches current model;
  renders as the provider's bubble to the patient).
- Unchanged: the 401/404 checks, the `provider.userId !== user.id` → 403 check,
  the `status !== "PENDING"` → 409 check, and the `connectBy` expiry → 410
  branch (all run before the transaction).

### Why a transaction

Block-join guarantees every human connect carries a greeting. Without atomicity,
a failure between the ACTIVE claim and the message create would leave an ACTIVE
chat with no message — the exact empty-room state this feature removes. The
transaction also keeps the race guard: if the sweeper expired the session a
moment earlier, the guarded update matches 0 rows and nothing is written.

## Testing

API (`accept/route.ts`):
- valid message → session `ACTIVE`, exactly one `Message` with
  `senderId = provider user`, both `publishSessionUpdate` and `publishMessage`
  fired.
- empty / whitespace-only / missing `message` → **400**, session still
  `PENDING`, no message written.
- `message` > 4000 chars → **400**, session still `PENDING`.
- session already claimed by another (guarded update hits 0 rows) → **409**, no
  message written, session not resurrected.
- caller is not the assigned provider → **403** (unchanged).
- past `connectBy` → **410** (unchanged), and no message written.

Client (`ChatRoom.tsx`):
- provider PENDING branch renders the textarea prefilled with the default.
- emptying the textarea disables the Accept button; non-empty re-enables it.

## Integration points (reference)

- `src/app/api/sessions/[id]/accept/route.ts` — validation + transaction.
- `src/components/ChatRoom.tsx:164` (`accept`) and `:224-241` (provider PENDING
  UI).
- `src/lib/greeting.ts` — new `DEFAULT_PROVIDER_GREETING` constant.
- Precedent: `src/lib/ai-provider.ts:13,39-54` (`GREETING` + `aiAcceptSession`).
- Reused bounds mirror `src/app/api/sessions/[id]/messages/route.ts:10`.
