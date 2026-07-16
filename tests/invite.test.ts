import { describe, expect, it } from "vitest";
import {
  inviteAcceptSchema,
  inviteCreateSchema,
  inviteStatus,
  isRedeemable,
  specialtiesSchema,
} from "@/lib/invite";

const now = new Date("2026-07-15T12:00:00Z");
const future = new Date("2026-07-20T12:00:00Z");
const past = new Date("2026-07-10T12:00:00Z");

describe("inviteStatus", () => {
  it("is PENDING while unexpired, unaccepted, and unrevoked", () => {
    expect(
      inviteStatus({ expiresAt: future, acceptedAt: null, revokedAt: null }, now)
    ).toBe("PENDING");
  });

  it("is EXPIRED once the deadline passes", () => {
    expect(
      inviteStatus({ expiresAt: past, acceptedAt: null, revokedAt: null }, now)
    ).toBe("EXPIRED");
  });

  it("treats the exact expiry instant as expired", () => {
    expect(
      inviteStatus({ expiresAt: now, acceptedAt: null, revokedAt: null }, now)
    ).toBe("EXPIRED");
  });

  it("is REVOKED when revoked before expiry", () => {
    expect(
      inviteStatus({ expiresAt: future, acceptedAt: null, revokedAt: past }, now)
    ).toBe("REVOKED");
  });

  it("reports REVOKED rather than EXPIRED for a revoked invite past its deadline", () => {
    expect(
      inviteStatus({ expiresAt: past, acceptedAt: null, revokedAt: past }, now)
    ).toBe("REVOKED");
  });

  it("reports ACCEPTED even if later expired or revoked", () => {
    expect(
      inviteStatus({ expiresAt: past, acceptedAt: past, revokedAt: past }, now)
    ).toBe("ACCEPTED");
  });
});

describe("isRedeemable", () => {
  it("allows only pending invites", () => {
    expect(
      isRedeemable({ expiresAt: future, acceptedAt: null, revokedAt: null }, now)
    ).toBe(true);
    expect(
      isRedeemable({ expiresAt: past, acceptedAt: null, revokedAt: null }, now)
    ).toBe(false);
    expect(
      isRedeemable({ expiresAt: future, acceptedAt: past, revokedAt: null }, now)
    ).toBe(false);
    expect(
      isRedeemable({ expiresAt: future, acceptedAt: null, revokedAt: past }, now)
    ).toBe(false);
  });
});

describe("inviteCreateSchema", () => {
  it("accepts a name and email", () => {
    expect(
      inviteCreateSchema.safeParse({ name: "Dr. Lee", email: "lee@example.com" })
        .success
    ).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const parsed = inviteCreateSchema.parse({
      name: "  Dr. Lee  ",
      email: " lee@example.com ",
    });
    expect(parsed.name).toBe("Dr. Lee");
    expect(parsed.email).toBe("lee@example.com");
  });

  it("rejects a bad email or empty name", () => {
    expect(
      inviteCreateSchema.safeParse({ name: "Dr. Lee", email: "not-an-email" }).success
    ).toBe(false);
    expect(
      inviteCreateSchema.safeParse({ name: "   ", email: "lee@example.com" }).success
    ).toBe(false);
  });
});

describe("specialtiesSchema", () => {
  it("accepts known concern tags", () => {
    expect(specialtiesSchema.safeParse(["anxiety", "trauma"]).success).toBe(true);
  });

  it("requires at least one", () => {
    expect(specialtiesSchema.safeParse([]).success).toBe(false);
  });

  it("rejects tags the matcher would never score against", () => {
    expect(specialtiesSchema.safeParse(["astrology"]).success).toBe(false);
  });
});

describe("inviteAcceptSchema", () => {
  const valid = { password: "long-enough-pw", specialties: ["anxiety"] };

  it("accepts a valid payload and defaults the bio", () => {
    const parsed = inviteAcceptSchema.parse(valid);
    expect(parsed.bio).toBe("");
  });

  it("rejects short passwords", () => {
    expect(
      inviteAcceptSchema.safeParse({ ...valid, password: "short" }).success
    ).toBe(false);
  });

  it("rejects an oversized bio", () => {
    expect(
      inviteAcceptSchema.safeParse({ ...valid, bio: "x".repeat(1001) }).success
    ).toBe(false);
  });
});
