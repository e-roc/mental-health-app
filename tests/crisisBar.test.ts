import { describe, it, expect } from "vitest";
import { shouldShowCrisisBar } from "@/lib/crisisBar";

describe("shouldShowCrisisBar", () => {
  it("shows for a logged-out visitor on a normal page", () => {
    expect(shouldShowCrisisBar(null, "/")).toBe(true);
  });

  it("shows for a USER", () => {
    expect(shouldShowCrisisBar("USER", "/questionnaire")).toBe(true);
  });

  it("shows for an ADMIN", () => {
    expect(shouldShowCrisisBar("ADMIN", "/admin")).toBe(true);
  });

  it("shows on the generic /login page", () => {
    expect(shouldShowCrisisBar(null, "/login")).toBe(true);
  });

  it("hides for a logged-in PROVIDER on any page", () => {
    expect(shouldShowCrisisBar("PROVIDER", "/provider")).toBe(false);
    expect(shouldShowCrisisBar("PROVIDER", "/chat/abc")).toBe(false);
  });

  it("hides on the provider login page even when logged out", () => {
    expect(shouldShowCrisisBar(null, "/provider/login")).toBe(false);
  });
});
