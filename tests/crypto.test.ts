import { beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "crypto";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.APP_INDEX_KEY = randomBytes(32).toString("hex");
});

describe("encrypt/decrypt", () => {
  it("round-trips plaintext", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const value = "Sensitive PII: Jane Doe, feeling anxious";
    expect(decrypt(encrypt(value))).toBe(value);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", async () => {
    const { encrypt } = await import("@/lib/crypto");
    expect(encrypt("same")).not.toBe(encrypt("same"));
  });

  it("handles unicode and empty strings", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    for (const v of ["", "émotions 😢", "日本語テキスト"]) {
      expect(decrypt(encrypt(v))).toBe(v);
    }
  });

  it("rejects tampered ciphertext (GCM auth)", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const payload = encrypt("secret");
    const parts = payload.split(":");
    const data = Buffer.from(parts[3], "base64");
    data[0] ^= 0xff;
    parts[3] = data.toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("rejects malformed payloads", async () => {
    const { decrypt } = await import("@/lib/crypto");
    expect(() => decrypt("not-a-ciphertext")).toThrow();
    expect(() => decrypt("v2:a:b:c")).toThrow();
  });
});

describe("blindIndex", () => {
  it("is deterministic and case/whitespace insensitive", async () => {
    const { blindIndex } = await import("@/lib/crypto");
    expect(blindIndex("User@Example.com ")).toBe(blindIndex("user@example.com"));
  });

  it("differs for different inputs", async () => {
    const { blindIndex } = await import("@/lib/crypto");
    expect(blindIndex("a@example.com")).not.toBe(blindIndex("b@example.com"));
  });
});

describe("password hashing", () => {
  it("verifies correct password and rejects wrong one", async () => {
    const { hashPassword, verifyPassword } = await import("@/lib/crypto");
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("uses a unique salt per hash", async () => {
    const { hashPassword } = await import("@/lib/crypto");
    expect(await hashPassword("pw")).not.toBe(await hashPassword("pw"));
  });

  it("rejects malformed stored hashes", async () => {
    const { verifyPassword } = await import("@/lib/crypto");
    expect(await verifyPassword("pw", "garbage")).toBe(false);
    expect(await verifyPassword("pw", "bcrypt:a:b")).toBe(false);
  });
});
