import { describe, it, expect } from "vitest";
import { DEMO_PASSWORD, PROVIDER_DEMO_ACCOUNTS } from "@/lib/demoProviders";

describe("demo provider credentials", () => {
  it("uses the shared README demo password", () => {
    expect(DEMO_PASSWORD).toBe("demo-password-123");
  });

  it("lists exactly the three README provider accounts", () => {
    const emails = PROVIDER_DEMO_ACCOUNTS.map((a) => a.email);
    expect(emails).toEqual([
      "ava.chen@demo.local",
      "sam.rivera@demo.local",
      "maya.okafor@demo.local",
    ]);
  });

  it("labels each account for the login panel", () => {
    for (const account of PROVIDER_DEMO_ACCOUNTS) {
      expect(account.name.length).toBeGreaterThan(0);
      expect(account.focus.length).toBeGreaterThan(0);
    }
  });
});
