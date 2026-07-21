import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { chatSession: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/pii", () => ({ getAnswersForQuestionnaire: vi.fn() }));

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAnswersForQuestionnaire } from "@/lib/pii";
import { GET } from "@/app/api/sessions/[id]/questionnaire/route";

const params = Promise.resolve({ id: "s1" });

const ANSWERS = {
  concerns: ["anxiety"],
  moodFrequency: "several-days",
  anxietyFrequency: "several-days",
  sleepQuality: "fair",
  priorSupport: "no",
  safetyConcern: "no",
  additionalNotes: "",
};

// Session participants: patient "u1", provider account "prov-user".
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    userId: "u1",
    provider: { userId: "prov-user" },
    questionnaireId: "q1",
    questionnaire: {
      id: "q1",
      riskLevel: "MODERATE",
      createdAt: new Date("2026-07-20T00:00:00Z"),
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/sessions/[id]/questionnaire", () => {
  it("401 when no current user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null as never);
    const res = await GET(new Request("http://test"), { params });
    expect(res.status).toBe(401);
  });

  it("404 when the session is missing", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(null as never);
    const res = await GET(new Request("http://test"), { params });
    expect(res.status).toBe(404);
  });

  it("403 when caller is neither participant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "stranger" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession() as never
    );
    const res = await GET(new Request("http://test"), { params });
    expect(res.status).toBe(403);
    expect(getAnswersForQuestionnaire).not.toHaveBeenCalled();
  });

  it("200 with decrypted answers for the provider participant", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession() as never
    );
    vi.mocked(getAnswersForQuestionnaire).mockResolvedValue(ANSWERS as never);

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.questionnaire.answers).toEqual(ANSWERS);
    expect(body.questionnaire.riskLevel).toBe("MODERATE");
    expect(body.questionnaire.createdAt).toBeTruthy();
    expect(getAnswersForQuestionnaire).toHaveBeenCalledOnce();
  });

  it("200 for the patient participant (own session)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession() as never
    );
    vi.mocked(getAnswersForQuestionnaire).mockResolvedValue(ANSWERS as never);

    const res = await GET(new Request("http://test"), { params });
    expect(res.status).toBe(200);
  });

  it("200 { questionnaire: null } and no decrypt when session has no intake", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession({ questionnaireId: null, questionnaire: null }) as never
    );

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.questionnaire).toBeNull();
    expect(getAnswersForQuestionnaire).not.toHaveBeenCalled();
  });

  it("200 with answers:null when decrypt is unreadable", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "prov-user" } as never);
    vi.mocked(prisma.chatSession.findUnique).mockResolvedValue(
      makeSession() as never
    );
    vi.mocked(getAnswersForQuestionnaire).mockResolvedValue(null as never);

    const res = await GET(new Request("http://test"), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.questionnaire.answers).toBeNull();
    expect(body.questionnaire.riskLevel).toBe("MODERATE");
  });
});
