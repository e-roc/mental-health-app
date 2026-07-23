# Admin Controls: Registration Allowlist, User Deletion, Password Change

**Date:** 2026-07-23
**Branch:** `admin-controls` (off `deployment`)

## Context

The live pilot site is publicly reachable and its `POST /api/auth/register`
endpoint is open to anyone. An automated bot already self-registered a junk
account (`probe-<hex>@demo.local`). Registration must be gated so only
pre-approved emails can create accounts, and admins need tools to manage the
allowlist, delete junk/patient accounts, and rotate their own password. We also
want to discourage crawler discovery/indexing of the pilot.

This app encrypts PII at rest (AES-256-GCM) and looks up emails by an HMAC
blind index (`blindIndex`, `src/lib/crypto.ts`). All new email-bearing data
follows that same pattern.

## Goals

1. **Invite-only registration** — self-service signup allowed only for emails an
   admin has pre-approved (an email *allowlist*, not token links).
2. **Admin: manage the allowlist** — add / remove approved emails.
3. **Admin: delete a user** — remove USER accounts (bot/junk cleanup).
4. **Admin: change own password** — self-service, verifying the current one.
5. **Crawler controls** — `robots.txt` + `noindex` header to reduce indexing.

## Non-Goals (deferred)

- Email verification / sending (no email provider yet — `src/lib/notify.ts` is a
  console stub).
- Password reset via email link.
- Audit logging of admin actions.
- Provider self-registration (providers still come via the existing
  `ProviderInvite` token flow).

Robots controls are **advisory** — well-behaved crawlers obey them; the abusive
bot that hit the register endpoint will not. The allowlist gate is the real
defense; robots/noindex only reduce discoverability.

## Design

### 1. Data model — new `AllowedEmail`

`prisma/schema.prisma`:

```prisma
model AllowedEmail {
  id        String   @id @default(cuid())
  emailHash String   @unique   // HMAC blind index, same pattern as User/ProviderInvite
  emailEnc  String              // AES-GCM so the admin UI can display the address
  addedById String
  createdAt DateTime @default(now())
}
```

Migration name: `registration_allowlist`. Generated locally with
`prisma migrate dev`; applied on Render automatically by the existing
`preDeployCommand: npx prisma migrate deploy` (see `render.yaml`).

### 2. Email normalization (shared correctness fix)

Add `normalizeEmail(email)` = `email.trim().toLowerCase()`. Today emails are
blind-indexed as typed, so `Foo@x.com` and `foo@x.com` hash differently — which
would let the gate be bypassed and break case-insensitive matching. Apply
`normalizeEmail` consistently wherever an email maps to a blind index:

- `src/app/api/auth/register/route.ts` (gate check + user create)
- `src/app/api/auth/login/route.ts` (lookup)
- `POST /api/admin/allowed-emails` (add)

Location: `src/lib/crypto.ts` (next to `blindIndex`) or a small `src/lib/email.ts`.
Single helper, reused — no duplicated lowercasing logic.

### 3. Registration gating

`src/app/api/auth/register/route.ts`, after input validation and before
`prisma.user.create`:

```
const emailHash = blindIndex(normalizeEmail(email));
const allowed = await prisma.allowedEmail.findUnique({ where: { emailHash } });
if (!allowed) return 403 { error: "Registration is invite-only." }
```

Existing behavior preserved: existing-user check still returns 409; rate limit
unchanged. Only new USER self-registration is gated (providers/admins are not
created through this route).

### 4. Admin API endpoints

All guard with `requireRole("ADMIN")` → 401 when not an admin, mirroring
`src/app/api/admin/providers/invite/route.ts`.

- **`POST /api/admin/allowed-emails`** `{ email }`
  - zod-validate email; `normalizeEmail`.
  - 409 if the `emailHash` already exists in `AllowedEmail`.
  - Create `{ emailHash, emailEnc: encrypt(email), addedById: admin.id }`.
- **`DELETE /api/admin/allowed-emails/[id]`**
  - 404 if not found; else delete. Does **not** touch any existing `User` row.
- **`DELETE /api/admin/users/[id]`**
  - 404 if not found.
  - Refuse (409) if `target.role !== "USER"` — never delete PROVIDER/ADMIN here.
  - Refuse (409) if `id === admin.id` — no self-delete.
  - `prisma.user.delete({ where: { id } })`. Cascade removes the user's
    questionnaires, chat sessions, messages, and auth sessions automatically
    (`onDelete: Cascade` in schema); `closedBy` back-references are `SetNull`.
- **`POST /api/admin/password`** `{ currentPassword, newPassword }`
  - `verifyPassword(currentPassword, admin.passwordHash)` → 401 if wrong.
  - `newPassword` `z.string().min(8).max(200)` (matches register) → 400 if bad.
  - Update `passwordHash = await hashPassword(newPassword)`.
  - Revoke the admin's **other** auth sessions (delete all `AuthSession` for
    `admin.id` except the current token) so a leaked session can't persist.

### 5. Overview endpoint

`src/app/api/admin/overview/route.ts` — add to the aggregate payload:

```
allowedEmails: allowed.map(a => ({
  id: a.id, email: decrypt(a.emailEnc), createdAt: a.createdAt,
}))
```

Fetched in the same `Promise.all`, ordered `createdAt desc`. Same shape/idiom as
the existing `invites` and `users` arrays.

### 6. Admin UI

`src/components/AdminDashboard.tsx` + new components, using existing `@/lib/ui`
styles (`card`, `btnPrimary`, `field`, `sectionTitle`, `pill`, etc.). After each
mutation the client calls `load()` (existing pattern; realtime `admin` channel +
30s poll already drive refresh).

- **`AllowedEmails` component** (mirrors `ProviderInvites`): a section listing
  approved emails with an add form and a remove button per row.
- **Users table:** add a Delete action column. Use a **two-click inline
  confirm** (button label toggles to "Confirm?" on first click, resets on blur/
  timeout) — no native `window.confirm` dialog.
- **`AccountSecurity` component:** a section with current-password + new-password
  inputs posting to `/api/admin/password`, with success/error text.

### 7. Crawler controls

- **`src/app/robots.ts`** — App Router metadata route returning
  `MetadataRoute.Robots` with `rules: { userAgent: "*", disallow: "/" }` (private
  invite-only pilot; nothing should be indexed). Confirm the exact Next 16
  convention against `node_modules/next/dist/docs/` before writing (per
  `AGENTS.md`, this is a breaking-change Next version).
- **`next.config.ts`** — add `X-Robots-Tag: noindex, nofollow` to the existing
  `headers()` list, covering pages reached without reading robots.txt.

## Testing (vitest, `vi.mock("@/lib/db")` per existing test style)

- **Register gate:** allowed email → success; not-allowed → 403; existing user →
  409; rate-limit path unchanged.
- **`normalizeEmail`:** case/whitespace variants produce the same blind index;
  an allowlist entry added as `Foo@X.com ` matches a registration as `foo@x.com`.
- **allowed-emails POST/DELETE:** add ok; duplicate → 409; invalid email → 400;
  non-admin → 401; delete missing → 404; delete does not remove a `User`.
- **users DELETE:** USER deleted ok; PROVIDER/ADMIN target → 409; self → 409;
  non-admin → 401; missing → 404.
- **password POST:** wrong current → 401; short new → 400; success updates hash
  and revokes other sessions; non-admin → 401.

## Rollout

1. Merge to `deployment`; push. Render auto-deploys; `prisma migrate deploy`
   applies `registration_allowlist` before the new code goes live.
2. Seed the allowlist with the intended pilot emails (admin UI, or a one-off).
3. Verify: a non-allowlisted email gets 403 at `/register`; an allowlisted one
   succeeds; admin can add/remove emails, delete a USER, and change its password.
```
