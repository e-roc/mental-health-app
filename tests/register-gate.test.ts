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
