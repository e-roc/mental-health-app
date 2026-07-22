import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const tx = {
    chatSession: { updateMany: vi.fn() },
    message: { create: vi.fn() },
  };
  return {
    prisma: {
      chatSession: { findUnique: vi.fn(), updateMany: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      _tx: tx,
    },
  };
});
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/events", () => ({
  publishSessionUpdate: vi.fn(),
  publishMessage: vi.fn(),
}));
vi.mock("@/lib/crypto", () => ({ encrypt: vi.fn((s: string) => `enc(${s})`) }));

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { publishSessionUpdate, publishMessage } from "@/lib/events";
import { POST } from "@/app/api/sessions/[id]/accept/route";

// Interactive-transaction client the route mutates inside prisma.$transaction.
const tx = (prisma as unknown as { _tx: { chatSession: { updateMany: ReturnType<typeof vi.fn> }; message: { create: ReturnType<typeof vi.fn> } } })._tx;

const params = Promise.resolve({ id: "s1" });

function pendingSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: "u1",
    providerId: "p1",
    status: "PENDING",
    // Far future so the connect window is open by default.
    connectBy: new Date(Date.now() + 60_000),
    provider: { id: "p1", userId: "prov-user", isAI: false },
    ...overrides,
  };
}

function acceptReq(body?: unknown) {
  return new Request("http://test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the guarded claim succeeds.
  tx.chatSession.updateMany.mockResolvedValue({ count: 1 } as never);
});

describe("POST /api/sessions/[id]/accept", () => {
  it("connects the session and sends the provider's message atomically", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession() as never
    );

    const res = await POST(acceptReq({ message: "Hi, glad you reached out." }), {
      params,
    });

    expect(res.status).toBe(200);
    // Guarded PENDING -> ACTIVE claim, inside the transaction.
    expect(tx.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1", status: "PENDING" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
    // The message is the provider's first chat message, encrypted.
    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "s1",
          senderId: "prov-user",
          bodyEnc: "enc(Hi, glad you reached out.)",
        }),
      })
    );
    expect(publishSessionUpdate).toHaveBeenCalledWith("s1");
    expect(publishMessage).toHaveBeenCalledWith("s1");
  });

  it("trims the message before encrypting", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession() as never
    );

    await POST(acceptReq({ message: "  spaced  " }), { params });

    expect(tx.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ bodyEnc: "enc(spaced)" }),
      })
    );
  });

  it("rejects an empty message and leaves the session pending", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession() as never
    );

    const res = await POST(acceptReq({ message: "" }), { params });

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.chatSession.updateMany).not.toHaveBeenCalled();
    expect(tx.message.create).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only message", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession() as never
    );

    const res = await POST(acceptReq({ message: "   \n\t " }), { params });

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a missing message", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession() as never
    );

    const res = await POST(acceptReq({}), { params });

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a message over 4000 characters", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession() as never
    );

    const res = await POST(acceptReq({ message: "x".repeat(4001) }), { params });

    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not write a message when another instance already claimed the session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession() as never
    );
    // Guarded claim races and loses.
    tx.chatSession.updateMany.mockResolvedValue({ count: 0 } as never);

    const res = await POST(acceptReq({ message: "Hi there." }), { params });

    expect(res.status).toBe(409);
    expect(tx.message.create).not.toHaveBeenCalled();
    expect(publishSessionUpdate).not.toHaveBeenCalled();
    expect(publishMessage).not.toHaveBeenCalled();
  });

  it("rejects a caller who is not the assigned provider", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "stranger" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession() as never
    );

    const res = await POST(acceptReq({ message: "Hi there." }), { params });

    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not write a message once the connect window has expired", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      pendingSession({ connectBy: new Date(Date.now() - 1_000) }) as never
    );

    const res = await POST(acceptReq({ message: "Hi there." }), { params });

    expect(res.status).toBe(410);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.message.create).not.toHaveBeenCalled();
  });
});
