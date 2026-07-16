import { describe, expect, it } from "vitest";
import { matchProvider } from "@/lib/matching";

const fixedRng = (v: number) => () => v;

describe("matchProvider", () => {
  it("returns null when no providers are available", () => {
    expect(matchProvider(["anxiety"], [])).toBeNull();
  });

  it("picks the provider with the highest specialty overlap", () => {
    const result = matchProvider(
      ["anxiety", "sleep"],
      [
        { id: "a", specialties: ["depression"] },
        { id: "b", specialties: ["anxiety", "sleep"] },
        { id: "c", specialties: ["anxiety"] },
      ]
    );
    expect(result).toEqual({ providerId: "b", matchType: "MATCHED" });
  });

  it("breaks ties deterministically with injected rng", () => {
    const candidates = [
      { id: "a", specialties: ["anxiety"] },
      { id: "b", specialties: ["anxiety"] },
    ];
    expect(matchProvider(["anxiety"], candidates, fixedRng(0))?.providerId).toBe("a");
    expect(matchProvider(["anxiety"], candidates, fixedRng(0.99))?.providerId).toBe("b");
  });

  it("falls back to a random available provider when nobody matches", () => {
    const result = matchProvider(
      ["grief"],
      [
        { id: "a", specialties: ["anxiety"] },
        { id: "b", specialties: ["sleep"] },
      ],
      fixedRng(0.6)
    );
    expect(result).toEqual({ providerId: "b", matchType: "RANDOM_FALLBACK" });
  });

  it("falls back when providers have no specialties at all", () => {
    const result = matchProvider(
      ["anxiety"],
      [{ id: "a", specialties: [] }],
      fixedRng(0)
    );
    expect(result).toEqual({ providerId: "a", matchType: "RANDOM_FALLBACK" });
  });

  it("falls back when the user selected no concerns", () => {
    const result = matchProvider(
      [],
      [{ id: "a", specialties: ["anxiety"] }],
      fixedRng(0)
    );
    expect(result?.matchType).toBe("RANDOM_FALLBACK");
  });
});

