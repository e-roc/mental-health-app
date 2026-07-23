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
