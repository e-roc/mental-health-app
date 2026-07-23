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
