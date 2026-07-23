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
    expect(prisma.user.delete).not.toHaveBeenCalled();
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
    expect(prisma.user.delete).not.toHaveBeenCalled();
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
  it("200 when the user is deleted concurrently (P2025 is idempotent success)", async () => {
    vi.mocked(requireRole).mockResolvedValue(ADMIN as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "u1", role: "USER" } as never);
    vi.mocked(prisma.user.delete).mockRejectedValue(
      Object.assign(new Error("gone"), { code: "P2025" }) as never
    );
    const res = await call("u1");
    expect(res.status).toBe(200);
  });
});
