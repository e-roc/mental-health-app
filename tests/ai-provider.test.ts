import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "crypto";

vi.mock("@/lib/db", () => ({
  prisma: {
    chatSession: { updateMany: vi.fn(), findUnique: vi.fn() },
    message: { create: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/events", () => ({
  publishMessage: vi.fn(),
  publishSessionUpdate: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { publishMessage, publishSessionUpdate } from "@/lib/events";
import { aiAcceptSession } from "@/lib/ai-provider";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aiAcceptSession", () => {
  it("claims the session conditionally on PENDING", async () => {
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);

    await aiAcceptSession("s1", "ai-user");

    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "s1", status: "PENDING" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      })
    );
  });

  it("writes a greeting and publishes when it wins the claim", async () => {
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);

    await aiAcceptSession("s1", "ai-user");

    expect(prisma.message.create).toHaveBeenCalledOnce();
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sessionId: "s1",
          senderId: "ai-user",
          // Encrypted at rest, never plaintext. Ciphertext format is
          // v1:<iv>:<authTag>:<ciphertext> (see src/lib/crypto.ts).
          bodyEnc: expect.stringMatching(/^v1:/),
        }),
      })
    );
    expect(publishSessionUpdate).toHaveBeenCalledWith("s1");
    expect(publishMessage).toHaveBeenCalledWith("s1");
  });

  it("no-ops when the session is no longer PENDING (human accepted first)", async () => {
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 0 } as never);

    await aiAcceptSession("s1", "ai-user");

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(publishMessage).not.toHaveBeenCalled();
    expect(publishSessionUpdate).not.toHaveBeenCalled();
  });
});
