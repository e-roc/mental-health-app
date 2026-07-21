import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    chatSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    message: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/crypto", () => ({ decrypt: vi.fn((s: string) => s) }));
vi.mock("@/lib/pii", () => ({ userName: vi.fn(() => "Counterpart") }));
vi.mock("@/lib/router", () => ({ expireAndRereoute: vi.fn() }));

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { GET } from "@/app/api/sessions/[id]/route";

const params = Promise.resolve({ id: "s1" });

// Viewer perspectives: the user is "u1", the provider account is "prov-user".
// isAI: false + humanTakeover: true keeps the takeover write-branch (route.ts:38-44)
// from firing, so these fixtures isolate the closedBy expression under test.
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: "u1",
    status: "ACTIVE",
    closedById: null,
    connectBy: new Date("2020-01-01T00:00:00Z"),
    humanTakeover: true,
    provider: {
      userId: "prov-user",
      isAI: false,
      user: { id: "prov-user", nameEnc: "prov-enc" },
    },
    user: { id: "u1", nameEnc: "user-enc" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.message.findMany).mockResolvedValue([]);
});

describe("GET /api/sessions/[id] closedBy tri-state", () => {
  it("is null when the session is not closed", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession({ status: "ACTIVE", closedById: null }) as never
    );

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.closedBy).toBeNull();
  });

  it("is null (not 'them') for a CLOSED session with no recorded closer — legacy row", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession({ status: "CLOSED", closedById: null }) as never
    );

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.closedBy).toBeNull();
  });

  it("is 'me' when the viewer (the user) is the recorded closer", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession({ status: "CLOSED", closedById: "u1" }) as never
    );

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.closedBy).toBe("me");
  });

  it("is 'them' when the viewer (the provider) sees the user closed it", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession({ status: "CLOSED", closedById: "u1" }) as never
    );

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.closedBy).toBe("them");
  });
});
