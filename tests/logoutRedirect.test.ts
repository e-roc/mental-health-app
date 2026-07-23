import { describe, it, expect } from "vitest";
import { logoutRedirect } from "@/lib/logoutRedirect";

describe("logoutRedirect", () => {
  it("sends a provider to the provider login page", () => {
    expect(logoutRedirect("PROVIDER")).toBe("/provider/login");
  });

  it("sends a USER to the home page", () => {
    expect(logoutRedirect("USER")).toBe("/");
  });

  it("sends an ADMIN to the home page", () => {
    expect(logoutRedirect("ADMIN")).toBe("/");
  });

  it("falls back to the home page for an unknown role", () => {
    expect(logoutRedirect(null)).toBe("/");
    expect(logoutRedirect(undefined)).toBe("/");
  });
});
