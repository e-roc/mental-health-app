import { describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Foo@X.com ")).toBe("foo@x.com");
  });
  it("is idempotent", () => {
    expect(normalizeEmail(normalizeEmail("A@B.CO"))).toBe("a@b.co");
  });
  it("leaves an already-normal address unchanged", () => {
    expect(normalizeEmail("ava.chen@demo.local")).toBe("ava.chen@demo.local");
  });
});
