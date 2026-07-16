import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";
import type { Questionnaire, User } from "@prisma/client";
import type { QuestionnaireAnswers } from "@/lib/questionnaire";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
});

const baseAnswers: QuestionnaireAnswers = {
  concerns: ["anxiety", "sleep"],
  moodFrequency: "several-days",
  anxietyFrequency: "not-at-all",
  sleepQuality: "fair",
  priorSupport: "no",
  safetyConcern: "no",
  additionalNotes: "prefers text over calls",
};

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    role: "USER",
    emailHash: "hash",
    emailEnc: "",
    nameEnc: "",
    passwordHash: "scrypt:a:b",
    createdAt: new Date(),
    ...overrides,
  } as User;
}

function fakeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return {
    id: "q1",
    userId: "u1",
    answersEnc: "",
    concernsEnc: "",
    riskLevel: "LOW",
    createdAt: new Date(),
    ...overrides,
  } as Questionnaire;
}

describe("userName / userEmail", () => {
  it("decrypts round-tripped values", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const { userName, userEmail } = await import("@/lib/pii");
    const user = fakeUser({
      nameEnc: encrypt("Jamie Rivera"),
      emailEnc: encrypt("jamie@example.com"),
    });
    expect(userName(user)).toBe("Jamie Rivera");
    expect(userEmail(user)).toBe("jamie@example.com");
  });

  it("falls back to a placeholder for corrupt ciphertext", async () => {
    const { userName, userEmail } = await import("@/lib/pii");
    const user = fakeUser({ nameEnc: "garbage", emailEnc: "garbage" });
    expect(userName(user)).toBe("(unreadable)");
    expect(userEmail(user)).toBe("(unreadable)");
  });
});

describe("getConcernsForQuestionnaire", () => {
  it("decrypts the concern tags", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const { getConcernsForQuestionnaire } = await import("@/lib/pii");
    const q = fakeQuestionnaire({
      concernsEnc: encrypt(JSON.stringify(baseAnswers.concerns)),
    });
    expect(await getConcernsForQuestionnaire(q)).toEqual(["anxiety", "sleep"]);
  });

  it("returns an empty array for corrupt ciphertext", async () => {
    const { getConcernsForQuestionnaire } = await import("@/lib/pii");
    const q = fakeQuestionnaire({ concernsEnc: "garbage" });
    expect(await getConcernsForQuestionnaire(q)).toEqual([]);
  });

  it("returns an empty array when the payload isn't an array", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const { getConcernsForQuestionnaire } = await import("@/lib/pii");
    const q = fakeQuestionnaire({ concernsEnc: encrypt(JSON.stringify({ not: "an array" })) });
    expect(await getConcernsForQuestionnaire(q)).toEqual([]);
  });
});

describe("getAnswersForQuestionnaire", () => {
  it("decrypts and round-trips full answers, e.g. to prefill an update", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const { getAnswersForQuestionnaire } = await import("@/lib/pii");
    const q = fakeQuestionnaire({ answersEnc: encrypt(JSON.stringify(baseAnswers)) });
    expect(await getAnswersForQuestionnaire(q)).toEqual(baseAnswers);
  });

  it("returns null for corrupt ciphertext", async () => {
    const { getAnswersForQuestionnaire } = await import("@/lib/pii");
    const q = fakeQuestionnaire({ answersEnc: "garbage" });
    expect(await getAnswersForQuestionnaire(q)).toBeNull();
  });

  it("returns null when the decrypted payload no longer matches the schema", async () => {
    const { encrypt } = await import("@/lib/crypto");
    const { getAnswersForQuestionnaire } = await import("@/lib/pii");
    const q = fakeQuestionnaire({
      answersEnc: encrypt(JSON.stringify({ concerns: ["anxiety"] })), // missing required fields
    });
    expect(await getAnswersForQuestionnaire(q)).toBeNull();
  });
});
