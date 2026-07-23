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
