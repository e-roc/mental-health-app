import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    chatSession: { findUnique: vi.fn(), updateMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/events", () => ({ publishSessionUpdate: vi.fn() }));

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { POST } from "@/app/api/sessions/[id]/close/route";

const params = Promise.resolve({ id: "s1" });

function activeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: "u1",
    providerId: "p1",
    status: "ACTIVE",
    closedById: null,
    provider: { id: "p1", userId: "prov-user", isAI: false },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/sessions/[id]/close", () => {
  it("records the closing user's id", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(activeSession() as never);
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);

    const res = await POST(new Request("http://test"), { params });

    expect(res.status).toBe(200);
    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1", status: { in: ["PENDING", "ACTIVE"] } },
        data: expect.objectContaining({ status: "CLOSED", closedById: "u1" }),
      })
    );
  });

  it("records the provider as closer when the provider ends it", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(activeSession() as never);
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);

    await POST(new Request("http://test"), { params });

    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ closedById: "prov-user" }),
      })
    );
  });

  it("rejects a non-participant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "stranger" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(activeSession() as never);

    const res = await POST(new Request("http://test"), { params });

    expect(res.status).toBe(403);
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new Request("http://test"), { params });

    expect(res.status).toBe(401);
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent on an already-closed session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      activeSession({ status: "CLOSED", closedById: "prov-user" }) as never
    );

    const res = await POST(new Request("http://test"), { params });

    expect(res.status).toBe(200);
    // Must not overwrite the original closer's attribution.
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });
});
