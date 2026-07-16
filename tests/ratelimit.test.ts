import { afterEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, clientIp, resetRateLimiter } from "@/lib/ratelimit";

afterEach(() => {
  resetRateLimiter();
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("allows up to the limit within a window", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).toBe(true);
    }
    expect(checkRateLimit("k", { limit: 5, windowMs: 60_000 })).toBe(false);
  });

  it("tracks keys independently", () => {
    expect(checkRateLimit("a", { limit: 1, windowMs: 60_000 })).toBe(true);
    expect(checkRateLimit("a", { limit: 1, windowMs: 60_000 })).toBe(false);
    expect(checkRateLimit("b", { limit: 1, windowMs: 60_000 })).toBe(true);
  });

  it("resets after the window elapses", () => {
    vi.useFakeTimers();
    expect(checkRateLimit("k", { limit: 1, windowMs: 1_000 })).toBe(true);
    expect(checkRateLimit("k", { limit: 1, windowMs: 1_000 })).toBe(false);
    vi.advanceTimersByTime(1_001);
    expect(checkRateLimit("k", { limit: 1, windowMs: 1_000 })).toBe(true);
  });
});

describe("clientIp", () => {
  it("takes the first hop from x-forwarded-for", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.9");
  });

  it("falls back when no forwarding header exists", () => {
    expect(clientIp(new Request("http://x"))).toBe("unknown");
  });
});
