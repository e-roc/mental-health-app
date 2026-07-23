import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(async () => []) },
    providerProfile: { findMany: vi.fn(async () => []) },
    chatSession: { findMany: vi.fn(async () => []) },
    providerInvite: { findMany: vi.fn(async () => []) },
    allowedEmail: {
      findMany: vi.fn(async () => [
        { id: "ae1", emailEnc: "enc", createdAt: new Date("2026-07-23T00:00:00Z") },
      ]),
    },
  },
}));
vi.mock("@/lib/auth", () => ({ requireRole: vi.fn(async () => ({ id: "admin1", role: "ADMIN" })) }));
vi.mock("@/lib/availability", () => ({ syncScheduledAvailability: vi.fn(async () => {}) }));
vi.mock("@/lib/pii", () => ({ userEmail: vi.fn(() => "x@y.z"), userName: vi.fn(() => "X") }));
vi.mock("@/lib/crypto", () => ({ decrypt: vi.fn(() => "allow@list.com") }));
vi.mock("@/lib/invite", () => ({ inviteStatus: vi.fn(() => "PENDING") }));
vi.mock("@/lib/settings", () => ({ getConnectWindowMinutes: vi.fn(async () => 10) }));

import { GET } from "@/app/api/admin/overview/route";

beforeEach(() => vi.clearAllMocks());

describe("GET /api/admin/overview", () => {
  it("includes allowedEmails with decrypted addresses", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.allowedEmails).toEqual([
      { id: "ae1", email: "allow@list.com", createdAt: "2026-07-23T00:00:00.000Z" },
    ]);
  });
});
