import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    providerProfile: { findMany: vi.fn() },
    chatSession: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));
vi.mock("@/lib/availability", () => ({ syncScheduledAvailability: vi.fn() }));
vi.mock("@/lib/settings", () => ({ getConnectWindowMinutes: vi.fn(async () => 5) }));
vi.mock("@/lib/notify", () => ({ pingProvider: vi.fn() }));
vi.mock("@/lib/ai-provider", () => ({ aiAcceptSession: vi.fn() }));
vi.mock("@/lib/pii", () => ({ getConcernsForQuestionnaire: vi.fn(async () => ["anxiety"]) }));
vi.mock("@/lib/events", () => ({
  publishProviderPing: vi.fn(),
  publishRerouted: vi.fn(),
  publishSessionUpdate: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { aiAcceptSession } from "@/lib/ai-provider";
import { publishRerouted } from "@/lib/events";
import { routeUserToProvider, expireAndRereoute } from "@/lib/router";

const PAST = new Date(Date.now() - 60_000);
const FUTURE = new Date(Date.now() + 60_000);

function pendingSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: "u1",
    providerId: "p1",
    questionnaireId: "q1",
    status: "PENDING",
    matchType: "MATCHED",
    connectBy: PAST,
    acceptedAt: null,
    closedAt: null,
    createdAt: new Date(),
    humanTakeover: false,
    questionnaire: { id: "q1", concernsEnc: "enc" },
    provider: { id: "p1", userId: "prov-user", isAI: false },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("routeUserToProvider", () => {
  it("leaves an AI provider's session PENDING instead of accepting instantly", async () => {
    vi.mocked(prisma.providerProfile.findMany).mockResolvedValue([
      { id: "p1", specialties: ["anxiety"], isAI: true, userId: "ai-user" },
    ] as never);
    vi.mocked(prisma.chatSession.create).mockResolvedValue(
      pendingSession({ connectBy: FUTURE, provider: { id: "p1", userId: "ai-user", isAI: true } }) as never
    );

    const session = await routeUserToProvider({
      userId: "u1",
      questionnaireId: "q1",
      concerns: ["anxiety"],
    });

    expect(session?.status).toBe("PENDING");
    expect(aiAcceptSession).not.toHaveBeenCalled();
  });
});

describe("expireAndRereoute", () => {
  it("connects an AI provider at the deadline instead of expiring", async () => {
    vi.mocked(prisma.chatSession.findUniqueOrThrow)
      .mockResolvedValueOnce(
        pendingSession({ provider: { id: "p1", userId: "ai-user", isAI: true } }) as never
      )
      .mockResolvedValueOnce(
        pendingSession({ status: "ACTIVE", provider: { id: "p1", userId: "ai-user", isAI: true } }) as never
      );

    const result = await expireAndRereoute("s1");

    expect(aiAcceptSession).toHaveBeenCalledWith("s1", "ai-user");
    expect(result.id).toBe("s1");
    expect(result.status).toBe("ACTIVE");
    // The AI path must not expire the session or re-route the user.
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
    expect(publishRerouted).not.toHaveBeenCalled();
  });

  it("expires and re-routes a human provider at the deadline", async () => {
    vi.mocked(prisma.chatSession.findUniqueOrThrow).mockResolvedValue(pendingSession() as never);
    vi.mocked(prisma.chatSession.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(prisma.chatSession.findMany).mockResolvedValue([{ providerId: "p1" }] as never);
    vi.mocked(prisma.providerProfile.findMany).mockResolvedValue([
      { id: "p2", specialties: ["anxiety"], isAI: false, userId: "prov2" },
    ] as never);
    vi.mocked(prisma.chatSession.create).mockResolvedValue(
      pendingSession({
        id: "s2",
        providerId: "p2",
        connectBy: FUTURE,
        provider: { id: "p2", userId: "prov2", isAI: false },
      }) as never
    );

    const result = await expireAndRereoute("s1");

    expect(aiAcceptSession).not.toHaveBeenCalled();
    expect(prisma.chatSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "s1", status: "PENDING" } })
    );
    expect(result.id).toBe("s2");
    expect(publishRerouted).toHaveBeenCalledWith("s1", "s2");
    // The provider who missed the window is excluded from the retry pool.
    expect(prisma.providerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { notIn: ["p1"] } }),
      })
    );
  });

  it("does nothing before the deadline", async () => {
    vi.mocked(prisma.chatSession.findUniqueOrThrow).mockResolvedValue(
      pendingSession({ connectBy: FUTURE }) as never
    );

    const result = await expireAndRereoute("s1");

    expect(result.status).toBe("PENDING");
    expect(aiAcceptSession).not.toHaveBeenCalled();
    expect(prisma.chatSession.updateMany).not.toHaveBeenCalled();
  });
});
