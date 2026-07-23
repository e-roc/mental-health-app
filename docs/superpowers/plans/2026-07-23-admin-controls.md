# Admin Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate registration to an admin-managed email allowlist, and give admins tools to manage that allowlist, delete USER accounts, and change their own password — plus crawler-noindex controls.

**Architecture:** New `AllowedEmail` table (blind-index + encrypted email, same PII pattern as `User`/`ProviderInvite`). The register route checks the allowlist before creating an account. Four new admin route handlers (all `requireRole("ADMIN")`), the overview endpoint gains an `allowedEmails` array, and the `AdminDashboard` gains two new sections plus a per-user delete action. A shared `normalizeEmail` helper makes all email→blind-index lookups case-insensitive.

**Tech Stack:** Next.js 16 (App Router, custom server), React 19, Prisma 6 + Postgres, zod, vitest. Field crypto via `@/lib/crypto` (`blindIndex`, `encrypt`, `decrypt`, `hashPassword`, `verifyPassword`, `hashToken`).

## Global Constraints

- **Branch:** `admin-controls` (already created off `deployment`).
- **PII pattern:** every stored email is `emailHash` (`blindIndex`) for lookup + `emailEnc` (`encrypt`) for display. Never store plaintext email.
- **Email normalization:** any email that becomes a blind index MUST pass through `normalizeEmail` first.
- **Admin auth:** every admin route starts with `const admin = await requireRole("ADMIN"); if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });`.
- **Test style:** `vi.mock("@/lib/db")` etc.; set `process.env.APP_ENCRYPTION_KEY`/`APP_INDEX_KEY` to `randomBytes(32).toString("hex")` in `beforeAll` when real crypto is exercised; call route handlers directly. Tests live in `tests/*.test.ts`, run with `npm run test`.
- **Password min length:** `z.string().min(8).max(200)` (matches register).
- **Next 16 is a breaking-change version** (`AGENTS.md`): before writing `robots.ts`, confirm the `MetadataRoute.Robots` convention in `node_modules/next/dist/docs/`.

---

## File Structure

- Create `src/lib/email.ts` — `normalizeEmail`.
- Modify `prisma/schema.prisma` — add `AllowedEmail` model.
- Create `prisma/migrations/<ts>_registration_allowlist/` — generated migration.
- Modify `src/app/api/auth/register/route.ts` — allowlist gate + normalize.
- Modify `src/app/api/auth/login/route.ts` — normalize lookup.
- Create `src/app/api/admin/allowed-emails/route.ts` — `POST`.
- Create `src/app/api/admin/allowed-emails/[id]/route.ts` — `DELETE`.
- Create `src/app/api/admin/users/[id]/route.ts` — `DELETE`.
- Create `src/app/api/admin/password/route.ts` — `POST`.
- Modify `src/app/api/admin/overview/route.ts` — add `allowedEmails`.
- Create `src/components/AllowedEmails.tsx`, `src/components/AccountSecurity.tsx`.
- Modify `src/components/AdminDashboard.tsx` — wire sections + user delete.
- Create `src/app/robots.ts`; modify `next.config.ts` — noindex header.
- Tests: `tests/email.test.ts`, `tests/register-gate.test.ts`, `tests/login-normalize.test.ts`, `tests/admin-allowed-emails.test.ts`, `tests/admin-delete-user.test.ts`, `tests/admin-password.test.ts`, `tests/admin-overview-allowlist.test.ts`.

---

### Task 1: `normalizeEmail` helper

**Files:**
- Create: `src/lib/email.ts`
- Test: `tests/email.test.ts`

**Interfaces:**
- Produces: `normalizeEmail(email: string): string` — trims and lowercases.

- [ ] **Step 1: Write the failing test**

```ts
// tests/email.test.ts
import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@X.com ")).toBe("foo@x.com");
  });
  it("is idempotent", () => {
    expect(normalizeEmail(normalizeEmail("A@B.CO"))).toBe("a@b.co");
  });
  it("leaves an already-normal address unchanged", () => {
    expect(normalizeEmail("ava.chen@demo.local")).toBe("ava.chen@demo.local");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/email.test.ts`
Expected: FAIL — cannot resolve `@/lib/email`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/email.ts
/** Canonical form for email equality: trim + lowercase. Apply before blindIndex. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/email.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts tests/email.test.ts
git commit -m "feat: add normalizeEmail helper for case-insensitive email lookup"
```

---

### Task 2: `AllowedEmail` model + migration

**Files:**
- Modify: `prisma/schema.prisma` (add model near `ProviderInvite`, ~line 56)
- Create: `prisma/migrations/<ts>_registration_allowlist/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma model `AllowedEmail { id, emailHash @unique, emailEnc, addedById, createdAt }` and generated client accessor `prisma.allowedEmail`.

- [ ] **Step 1: Add the model to the schema**

```prisma
// prisma/schema.prisma — add after the ProviderInvite model
// Emails an admin has pre-approved for self-registration. Registration is
// invite-only: the register route rejects any email not listed here.
model AllowedEmail {
  id        String   @id @default(cuid())
  emailHash String   @unique
  emailEnc  String
  addedById String
  createdAt DateTime @default(now())
}
```

- [ ] **Step 2: Start the local database (if not running)**

Run: `docker compose up -d db`
Expected: `db` container healthy (`docker compose ps` shows healthy).

- [ ] **Step 3: Generate the migration**

Run: `npx prisma migrate dev --name registration_allowlist`
Expected: creates `prisma/migrations/<ts>_registration_allowlist/migration.sql` with `CREATE TABLE "AllowedEmail"` and a unique index on `emailHash`; regenerates the client. (Requires `.env` with `DATABASE_URL` + the two key vars locally.)

- [ ] **Step 4: Verify schema validity and client generation**

Run: `npx prisma validate && npx prisma generate`
Expected: "The schema at prisma/schema.prisma is valid" and client generated with no error.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add AllowedEmail model + registration_allowlist migration"
```

---

### Task 3: Registration gating + login normalization

**Files:**
- Modify: `src/app/api/auth/register/route.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Test: `tests/register-gate.test.ts`, `tests/login-normalize.test.ts`

**Interfaces:**
- Consumes: `normalizeEmail` (Task 1); `prisma.allowedEmail.findUnique` (Task 2); existing `blindIndex`, `encrypt`, `hashPassword`, `verifyPassword`, `createSession`, `setSessionCookie`, `rateLimitOr429`.
- Produces: register returns `403 { error: "Registration is invite-only." }` for non-allowlisted emails; both routes look up by `blindIndex(normalizeEmail(email))`.

- [ ] **Step 1: Write the failing register test**

```ts
// tests/register-gate.test.ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    allowedEmail: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({
  createSession: vi.fn(async () => "tok"),
  setSessionCookie: vi.fn(async () => {}),
}));

import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { resetRateLimiter } from "@/lib/ratelimit";
import { blindIndex } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/email";
import { POST } from "@/app/api/auth/register/route";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
});
beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
});

function req(body: unknown, ip = "1.2.3.4") {
  return new Request("http://test/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const VALID = { name: "Pat", email: "Pat@Example.com", password: "password123" };

describe("POST /api/auth/register (allowlist gate)", () => {
  it("403 when the email is not on the allowlist", async () => {
    vi.mocked(prisma.allowedEmail.findUnique).mockResolvedValue(null as never);
    const res = await POST(req(VALID));
    expect(res.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("looks up the allowlist by the normalized blind index", async () => {
    vi.mocked(prisma.allowedEmail.findUnique).mockResolvedValue(null as never);
    await POST(req(VALID));
    expect(prisma.allowedEmail.findUnique).toHaveBeenCalledWith({
      where: { emailHash: blindIndex(normalizeEmail(VALID.email)) },
    });
  });

  it("409 when an account already exists", async () => {
    vi.mocked(prisma.allowedEmail.findUnique).mockResolvedValue({ id: "a1" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u0" } as never);
    const res = await POST(req(VALID));
    expect(res.status).toBe(409);
  });

  it("200 and creates the user when allowlisted and new", async () => {
    vi.mocked(prisma.allowedEmail.findUnique).mockResolvedValue({ id: "a1" } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.user.create).mockResolvedValue({ id: "u1", role: "USER" } as never);
    const res = await POST(req(VALID));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(createSession).toHaveBeenCalledWith("u1");
  });

  it("400 on invalid input", async () => {
    const res = await POST(req({ name: "", email: "bad", password: "x" }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/register-gate.test.ts`
Expected: FAIL — the 403 / allowlist-lookup tests fail (route doesn't check the allowlist yet).

- [ ] **Step 3: Modify the register route**

```ts
// src/app/api/auth/register/route.ts — full file
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { blindIndex, encrypt, hashPassword } from "@/lib/crypto";
import { createSession, setSessionCookie } from "@/lib/auth";
import { rateLimitOr429 } from "@/lib/ratelimit";
import { normalizeEmail } from "@/lib/email";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const limited = rateLimitOr429(req, "register", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const emailHash = blindIndex(email);

  // Invite-only: the email must be pre-approved by an admin.
  const allowed = await prisma.allowedEmail.findUnique({ where: { emailHash } });
  if (!allowed) {
    return NextResponse.json(
      { error: "Registration is invite-only." },
      { status: 403 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { emailHash } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      role: "USER",
      emailHash,
      emailEnc: encrypt(email),
      nameEnc: encrypt(name),
      passwordHash: await hashPassword(password),
    },
  });

  await setSessionCookie(await createSession(user.id));
  return NextResponse.json({ ok: true, role: user.role });
}
```

- [ ] **Step 4: Run to verify register tests pass**

Run: `npm run test -- tests/register-gate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the failing login-normalization test**

```ts
// tests/login-normalize.test.ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/auth", () => ({
  createSession: vi.fn(async () => "tok"),
  setSessionCookie: vi.fn(async () => {}),
}));

import { prisma } from "@/lib/db";
import { resetRateLimiter } from "@/lib/ratelimit";
import { blindIndex, hashPassword } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/email";
import { POST } from "@/app/api/auth/login/route";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
});
beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
});

function req(body: unknown) {
  return new Request("http://test/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login (email normalization)", () => {
  it("looks up by the normalized blind index and logs in", async () => {
    const passwordHash = await hashPassword("password123");
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", passwordHash } as never);
    const res = await POST(req({ email: "AVA.Chen@Demo.Local", password: "password123" }));
    expect(res.status).toBe(200);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { emailHash: blindIndex(normalizeEmail("AVA.Chen@Demo.Local")) },
    });
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm run test -- tests/login-normalize.test.ts`
Expected: FAIL — `findUnique` called with the un-normalized (mixed-case) hash.

- [ ] **Step 7: Modify the login lookup**

In `src/app/api/auth/login/route.ts`, add the import and normalize the lookup:

```ts
import { normalizeEmail } from "@/lib/email";
```

```ts
  const user = await prisma.user.findUnique({
    where: { emailHash: blindIndex(normalizeEmail(email)) },
  });
```

(Only the `where` line and the import change; the rest of the file is unchanged.)

- [ ] **Step 8: Run both auth tests**

Run: `npm run test -- tests/register-gate.test.ts tests/login-normalize.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 9: Commit**

```bash
git add src/app/api/auth/register/route.ts src/app/api/auth/login/route.ts tests/register-gate.test.ts tests/login-normalize.test.ts
git commit -m "feat: gate registration behind email allowlist; normalize auth email lookups"
```

---

### Task 4: Allowed-emails admin API

**Files:**
- Create: `src/app/api/admin/allowed-emails/route.ts` (`POST`)
- Create: `src/app/api/admin/allowed-emails/[id]/route.ts` (`DELETE`)
- Test: `tests/admin-allowed-emails.test.ts`

**Interfaces:**
- Consumes: `requireRole` (`@/lib/auth`), `blindIndex`/`encrypt` (`@/lib/crypto`), `normalizeEmail` (Task 1), `prisma.allowedEmail` (Task 2).
- Produces: `POST` → `{ id, email, createdAt }` (409 on dup); `DELETE /[id]` → `{ ok: true }` (404 if missing).

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin-allowed-emails.test.ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    allowedEmail: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { POST } from "@/app/api/admin/allowed-emails/route";
import { DELETE } from "@/app/api/admin/allowed-emails/[id]/route";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
});
beforeEach(() => vi.clearAllMocks());

const ADMIN = { id: "admin1", role: "ADMIN" };
function post(body: unknown) {
  return new Request("http://test", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/admin/allowed-emails", () => {
  it("401 for non-admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(null as never);
    expect((await POST(post({ email: "a@b.com" }))).status).toBe(401);
  });
  it("400 for invalid email", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    expect((await POST(post({ email: "nope" }))).status).toBe(400);
  });
  it("409 when already present", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    vi.mocked(prisma.allowedEmail.findUnique).mockResolvedValue({ id: "x" } as never);
    expect((await POST(post({ email: "a@b.com" }))).status).toBe(409);
  });
  it("200 and creates when new", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    vi.mocked(prisma.allowedEmail.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.allowedEmail.create).mockResolvedValue({ id: "ae1", createdAt: new Date() } as never);
    const res = await POST(post({ email: "New@B.com" }));
    expect(res.status).toBe(200);
    expect((await res.json()).email).toBe("new@b.com");
    expect(prisma.allowedEmail.create).toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/allowed-emails/[id]", () => {
  const params = Promise.resolve({ id: "ae1" });
  it("401 for non-admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(null as never);
    expect((await DELETE(new Request("http://test"), { params })).status).toBe(401);
  });
  it("404 when missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    vi.mocked(prisma.allowedEmail.findUnique).mockResolvedValue(null as never);
    expect((await DELETE(new Request("http://test"), { params })).status).toBe(404);
  });
  it("200 and deletes", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    vi.mocked(prisma.allowedEmail.findUnique).mockResolvedValue({ id: "ae1" } as never);
    const res = await DELETE(new Request("http://test"), { params });
    expect(res.status).toBe(200);
    expect(prisma.allowedEmail.delete).toHaveBeenCalledWith({ where: { id: "ae1" } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/admin-allowed-emails.test.ts`
Expected: FAIL — route modules don't exist.

- [ ] **Step 3: Implement `POST`**

```ts
// src/app/api/admin/allowed-emails/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { blindIndex, encrypt } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/email";

const schema = z.object({ email: z.string().trim().email().max(254) });

/** Add an email to the registration allowlist. */
export async function POST(req: Request) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const email = normalizeEmail(parsed.data.email);
  const emailHash = blindIndex(email);

  const existing = await prisma.allowedEmail.findUnique({ where: { emailHash } });
  if (existing) {
    return NextResponse.json(
      { error: "That email is already on the allowlist" },
      { status: 409 }
    );
  }

  const created = await prisma.allowedEmail.create({
    data: { emailHash, emailEnc: encrypt(email), addedById: admin.id },
  });
  return NextResponse.json({ id: created.id, email, createdAt: created.createdAt });
}
```

- [ ] **Step 4: Implement `DELETE`**

```ts
// src/app/api/admin/allowed-emails/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/** Remove an email from the allowlist. Does not touch any existing User. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.allowedEmail.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm run test -- tests/admin-allowed-emails.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/allowed-emails tests/admin-allowed-emails.test.ts
git commit -m "feat: admin API to add/remove allowlisted emails"
```

---

### Task 5: Delete-user admin API

**Files:**
- Create: `src/app/api/admin/users/[id]/route.ts` (`DELETE`)
- Test: `tests/admin-delete-user.test.ts`

**Interfaces:**
- Consumes: `requireRole`, `prisma.user.findUnique`/`delete`.
- Produces: `DELETE /[id]` → `{ ok: true }`. 409 self-delete, 409 non-USER target, 404 missing.

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin-delete-user.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { user: { findUnique: vi.fn(), delete: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { DELETE } from "@/app/api/admin/users/[id]/route";

beforeEach(() => vi.clearAllMocks());

const ADMIN = { id: "admin1", role: "ADMIN" };
const call = (id: string) => DELETE(new Request("http://test"), { params: Promise.resolve({ id }) });

describe("DELETE /api/admin/users/[id]", () => {
  it("401 for non-admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(null as never);
    expect((await call("u1")).status).toBe(401);
  });
  it("409 when deleting yourself", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    expect((await call("admin1")).status).toBe(409);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
  it("404 when the user is missing", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
    expect((await call("u1")).status).toBe(404);
  });
  it("409 when the target is not a USER", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "p1", role: "PROVIDER" } as never);
    expect((await call("p1")).status).toBe(409);
    expect(prisma.user.delete).not.toHaveBeenCalled();
  });
  it("200 and deletes a USER", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "USER" } as never);
    const res = await call("u1");
    expect(res.status).toBe(200);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u1" } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/admin-delete-user.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement `DELETE`**

```ts
// src/app/api/admin/users/[id]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/**
 * Delete a patient (USER) account. Their questionnaires, chat sessions, and
 * messages cascade-delete via the schema's onDelete: Cascade relations.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 409 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role !== "USER") {
    return NextResponse.json(
      { error: "Only patient accounts can be deleted here" },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/admin-delete-user.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/users tests/admin-delete-user.test.ts
git commit -m "feat: admin API to delete USER accounts (cascade)"
```

---

### Task 6: Change-own-password admin API

**Files:**
- Create: `src/app/api/admin/password/route.ts` (`POST`)
- Test: `tests/admin-password.test.ts`

**Interfaces:**
- Consumes: `requireRole`; `verifyPassword`, `hashPassword`, `hashToken` (`@/lib/crypto`); `SESSION_COOKIE` (`@/lib/constants`); `cookies` (`next/headers`); `prisma.user.update`, `prisma.authSession.deleteMany`.
- Produces: `POST` `{ currentPassword, newPassword }` → `{ ok: true }`. 401 wrong current, 400 short new, revokes other sessions.

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin-password.test.ts
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

vi.mock("@/lib/db", () => ({
  prisma: { user: { update: vi.fn() }, authSession: { deleteMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: () => ({ value: "current-tok" }) })),
}));

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { hashPassword, hashToken } from "@/lib/crypto";
import { POST } from "@/app/api/admin/password/route";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
});
beforeEach(() => vi.clearAllMocks());

async function admin() {
  return { id: "admin1", role: "ADMIN", passwordHash: await hashPassword("oldpass1") };
}
const post = (body: unknown) =>
  POST(new Request("http://test", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/admin/password", () => {
  it("401 for non-admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(null as never);
    expect((await post({ currentPassword: "x", newPassword: "newpass12" })).status).toBe(401);
  });
  it("401 when the current password is wrong", async () => {
    vi.mocked(requireRole).mockResolvedValue((await admin()) as never);
    const res = await post({ currentPassword: "WRONG", newPassword: "newpass12" });
    expect(res.status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
  it("400 when the new password is too short", async () => {
    vi.mocked(requireRole).mockResolvedValue((await admin()) as never);
    expect((await post({ currentPassword: "oldpass1", newPassword: "short" })).status).toBe(400);
  });
  it("200, updates the hash, and revokes other sessions", async () => {
    vi.mocked(requireRole).mockResolvedValue((await admin()) as never);
    const res = await post({ currentPassword: "oldpass1", newPassword: "newpass12" });
    expect(res.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "admin1" } })
    );
    expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
      where: { userId: "admin1", NOT: { tokenHash: hashToken("current-tok") } },
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/admin-password.test.ts`
Expected: FAIL — route module doesn't exist.

- [ ] **Step 3: Implement `POST`**

```ts
// src/app/api/admin/password/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { hashPassword, verifyPassword, hashToken } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/constants";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

/** Change the signed-in admin's own password; revoke their other sessions. */
export async function POST(req: Request) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { currentPassword, newPassword } = parsed.data;

  if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 401 }
    );
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Invalidate every other session for this admin; keep the current one alive.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await prisma.authSession.deleteMany({
    where: {
      userId: admin.id,
      ...(token ? { NOT: { tokenHash: hashToken(token) } } : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/admin-password.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/password tests/admin-password.test.ts
git commit -m "feat: admin API to change own password (verify current, revoke other sessions)"
```

---

### Task 7: Overview endpoint — expose allowlist

**Files:**
- Modify: `src/app/api/admin/overview/route.ts`
- Test: `tests/admin-overview-allowlist.test.ts`

**Interfaces:**
- Consumes: `prisma.allowedEmail.findMany`, `decrypt`.
- Produces: overview payload gains `allowedEmails: { id: string; email: string; createdAt: Date }[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin-overview-allowlist.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => []) },
    providerProfile: { findMany: vi.fn(async () => []) },
    chatSession: { findMany: vi.fn(async () => []) },
    providerInvite: { findMany: vi.fn(async () => []) },
    allowedEmail: {
      findMany: vi.fn(async () => [
        { id: "ae1", emailEnc: "enc", createdAt: new Date("2026-07-23T00:00:00Z") },
      ]),
    },
  },
}));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn(async () => ({ id: "admin1", role: "ADMIN" })) }));
vi.mock("@/lib/availability", () => ({ syncScheduledAvailability: vi.fn(async () => {}) }));
vi.mock("@/lib/pii", () => ({ userEmail: vi.fn(() => "x@y.z"), userName: vi.fn(() => "X") }));
vi.mock("@/lib/crypto", () => ({ decrypt: vi.fn(() => "allow@list.com") }));
vi.mock("@/lib/invite", () => ({ inviteStatus: vi.fn(() => "PENDING") }));
vi.mock("@/lib/settings", () => ({ getConnectWindowMinutes: vi.fn(async () => 10) }));

import { GET } from "@/app/api/admin/overview/route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/overview", () => {
  it("includes allowedEmails with decrypted addresses", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.allowedEmails).toEqual([
      { id: "ae1", email: "allow@list.com", createdAt: "2026-07-23T00:00:00.000Z" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test -- tests/admin-overview-allowlist.test.ts`
Expected: FAIL — `body.allowedEmails` is undefined.

- [ ] **Step 3: Modify the overview route**

Add `prisma.allowedEmail.findMany` to the `Promise.all` destructure and map it into the response. Concretely:

```ts
  const [users, providers, sessions, invites, allowedEmails, connectWindowMinutes] =
    await Promise.all([
      // ...existing four queries unchanged...
      prisma.allowedEmail.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
      getConnectWindowMinutes(),
    ]);
```

Then add to the returned JSON object (alongside `invites`):

```ts
    allowedEmails: allowedEmails.map((a) => ({
      id: a.id,
      email: decrypt(a.emailEnc),
      createdAt: a.createdAt,
    })),
```

(`decrypt` is already imported in this file.)

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test -- tests/admin-overview-allowlist.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm run test`
Expected: PASS — all existing tests plus the new ones.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/admin/overview/route.ts tests/admin-overview-allowlist.test.ts
git commit -m "feat: expose registration allowlist in admin overview"
```

---

### Task 8: Admin UI — allowlist section, password section, user delete

**Files:**
- Create: `src/components/AllowedEmails.tsx`, `src/components/AccountSecurity.tsx`
- Modify: `src/components/AdminDashboard.tsx`

**Interfaces:**
- Consumes: `/api/admin/allowed-emails` (Task 4), `/api/admin/users/[id]` (Task 5), `/api/admin/password` (Task 6), and the `allowedEmails` field from `/api/admin/overview` (Task 7).
- Produces: rendered admin sections; no exported API beyond the two React components.

> No component-test harness exists in this repo (tests target route/logic only). Verify this task with `npm run build` + manual smoke, following the existing convention.

- [ ] **Step 1: Create `AllowedEmails` component**

```tsx
// src/components/AllowedEmails.tsx
"use client";

import { useState } from "react";
import { btnPrimary, card, errorText, field, fieldLabel, sectionTitle } from "@/lib/ui";

export interface AllowedEmailRow {
  id: string;
  email: string;
  createdAt: string;
}

const th = "py-2.5 pr-4 text-xs font-semibold uppercase tracking-wider text-ink-faint";

export function AllowedEmails({
  emails,
  onChange,
}: {
  emails: AllowedEmailRow[];
  onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    const res = await fetch("/api/admin/allowed-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to add email");
      return;
    }
    form.reset();
    onChange();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/allowed-emails/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to remove email");
      return;
    }
    onChange();
  }

  return (
    <section className={card}>
      <h2 className={sectionTitle}>Registration allowlist</h2>
      <p className="mt-2 text-sm text-ink-faint">
        Only these emails can create an account. Removing an email here does not
        delete an account that already exists.
      </p>

      <form onSubmit={add} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className={fieldLabel}>Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="patient@example.com"
            className={`${field} w-64`}
          />
        </label>
        <button disabled={busy} className={btnPrimary}>
          {busy ? "Adding…" : "Add email"}
        </button>
      </form>

      {error && <p className={`mt-3 ${errorText}`}>{error}</p>}

      {emails.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm text-ink-soft">
            <thead>
              <tr>
                <th className={th}>Email</th>
                <th className={th}>Added</th>
                <th className="py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {emails.map((a) => (
                <tr key={a.id} className="border-t border-edge/60">
                  <td className="py-2.5 pr-4 text-ink">{a.email}</td>
                  <td className="py-2.5 pr-4 text-xs tabular-nums text-ink-faint">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => remove(a.id)}
                      className="text-xs text-ink-faint transition-colors duration-300 hover:text-rose"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Create `AccountSecurity` component**

```tsx
// src/components/AccountSecurity.tsx
"use client";

import { useState } from "react";
import { btnPrimary, card, errorText, field, fieldLabel, sectionTitle } from "@/lib/ui";

export function AccountSecurity() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await fetch("/api/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: String(fd.get("currentPassword") ?? ""),
        newPassword: String(fd.get("newPassword") ?? ""),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to change password");
      return;
    }
    form.reset();
    setOk(true);
  }

  return (
    <section className={card}>
      <h2 className={sectionTitle}>Change password</h2>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className={fieldLabel}>Current password</span>
          <input name="currentPassword" type="password" required className={`${field} w-56`} />
        </label>
        <label className="block text-sm">
          <span className={fieldLabel}>New password</span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            className={`${field} w-56`}
          />
        </label>
        <button disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : "Update password"}
        </button>
        {ok && <span className="pb-2.5 text-sm text-moss">Password updated</span>}
      </form>
      {error && <p className={`mt-3 ${errorText}`}>{error}</p>}
    </section>
  );
}
```

- [ ] **Step 3: Wire the new sections + user-delete into `AdminDashboard`**

In `src/components/AdminDashboard.tsx`:

1. Add imports near the top:

```tsx
import { AllowedEmails, type AllowedEmailRow } from "@/components/AllowedEmails";
import { AccountSecurity } from "@/components/AccountSecurity";
```

2. Extend the `Overview` interface with:

```tsx
  allowedEmails: AllowedEmailRow[];
```

3. Add a delete handler and a per-row confirm state inside the `AdminDashboard` component (near the other handlers, after `overrideAvailability`):

```tsx
  const [confirmingUserId, setConfirmingUserId] = useState<string | null>(null);

  async function deleteUser(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to delete user");
      return;
    }
    setConfirmingUserId(null);
    load();
  }
```

4. In the Users `<table>`, add a trailing header cell and a trailing body cell. Header row:

```tsx
                <th className="py-2.5"></th>
```

Body row (inside `data.users.map`, after the "Joined" `<td>`):

```tsx
                  <td className="py-2.5 text-right">
                    {confirmingUserId === u.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={() => deleteUser(u.id)}
                          className="text-xs font-semibold text-rose hover:text-rose"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmingUserId(null)}
                          className="text-xs text-ink-faint hover:text-ink-soft"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmingUserId(u.id)}
                        className="text-xs text-ink-faint transition-colors duration-300 hover:text-rose"
                      >
                        Delete
                      </button>
                    )}
                  </td>
```

Also bump the empty-state `colSpan` on the Users table from `4` to `5`.

5. Render the two new sections. Add the allowlist next to the provider-invites block and the password section at the end of the dashboard `return`:

```tsx
      <div className="rise rise-4">
        <AllowedEmails emails={data.allowedEmails} onChange={load} />
      </div>
```

```tsx
      <section className="rise rise-4">
        <AccountSecurity />
      </section>
```

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: build succeeds (Next compiles all routes and components; no type errors).

- [ ] **Step 5: Manual smoke (local)**

Run `docker compose up -d db` then `npm start`. As `admin@demo.local` / `demo-password-123`: add an allowlisted email, register a new account with it in another browser (succeeds), try a non-listed email (403), remove an allowlisted email, delete a USER (two-click confirm), and change the admin password (wrong current → error; correct → success, other sessions dropped).

- [ ] **Step 6: Commit**

```bash
git add src/components/AllowedEmails.tsx src/components/AccountSecurity.tsx src/components/AdminDashboard.tsx
git commit -m "feat: admin UI for allowlist, user deletion, and password change"
```

---

### Task 9: Crawler noindex controls

**Files:**
- Create: `src/app/robots.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: `/robots.txt` disallowing all crawlers; an `X-Robots-Tag: noindex, nofollow` response header on every route.

- [ ] **Step 1: Confirm the Next 16 robots convention**

Read `node_modules/next/dist/docs/` (or the App Router metadata docs) for the `MetadataRoute.Robots` file convention before writing — per `AGENTS.md`, this Next version may differ from training data.

- [ ] **Step 2: Create `robots.ts`**

```ts
// src/app/robots.ts
import type { MetadataRoute } from "next";

// Private invite-only pilot: keep the whole app out of search indexes.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
```

- [ ] **Step 3: Add the noindex header**

In `next.config.ts`, add one entry to the `securityHeaders` array:

```ts
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: build succeeds and lists a `/robots.txt` route.

Then (local) `npm start` and:
Run: `curl -s http://localhost:3000/robots.txt` → contains `User-Agent: *` and `Disallow: /`.
Run: `curl -sI http://localhost:3000/ | grep -i x-robots-tag` → `X-Robots-Tag: noindex, nofollow`.

- [ ] **Step 5: Commit**

```bash
git add src/app/robots.ts next.config.ts
git commit -m "feat: disallow crawlers via robots.txt and X-Robots-Tag noindex"
```

---

## Self-Review

- **Spec coverage:** allowlist model (T2), gating (T3), normalization (T1/T3), allowlist admin API (T4), delete user (T5), password change + session revoke (T6), overview payload (T7), admin UI incl. two-click delete (T8), robots + noindex (T9), tests for each API. All spec sections map to a task.
- **Type consistency:** `normalizeEmail` signature identical across T1/T3/T4; `AllowedEmailRow` defined in T8's component and reused in the `Overview` interface; overview `allowedEmails` field shape (`{id,email,createdAt}`) matches T7 output and T8 consumption.
- **Non-goals honored:** no email sending, no password-reset-by-email, no audit log, no provider self-registration.

## Rollout (after merge)

1. Merge `admin-controls` → `deployment`; push. Render runs `prisma migrate deploy` (applies `registration_allowlist`) before the new code goes live.
2. In the admin UI, add the intended pilot emails to the allowlist.
3. Delete the existing `probe-*@demo.local` junk account.
4. Verify: non-allowlisted email → 403 at `/register`; allowlisted email registers; `/robots.txt` disallows all.
