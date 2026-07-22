import { describe, expect, it } from "vitest";
import { DEFAULT_PROVIDER_GREETING } from "@/lib/greeting";

// The default greeting is prefilled into the provider's join box, and the
// block-join rule refuses an empty message. So the default itself must satisfy
// that same validation (trimmed, 1..4000 chars) or providers couldn't accept
// without editing it.
describe("DEFAULT_PROVIDER_GREETING", () => {
  it("passes the block-join validation it seeds", () => {
    const trimmed = DEFAULT_PROVIDER_GREETING.trim();
    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.length).toBeLessThanOrEqual(4000);
    expect(DEFAULT_PROVIDER_GREETING).toBe(trimmed);
  });
});
