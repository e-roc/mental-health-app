import { describe, expect, it } from "vitest";
import { isWithinSchedule, validateBlock } from "@/lib/availability";

// Mon 2026-07-13 was a Monday; build dates relative to a known week.
function at(dayOfWeek: number, hour: number, minute = 0): Date {
  // 2026-07-12 is a Sunday (day 0)
  const d = new Date(2026, 6, 12 + dayOfWeek, hour, minute);
  return d;
}

describe("isWithinSchedule", () => {
  const monday9to17 = [{ dayOfWeek: 1, startMin: 9 * 60, endMin: 17 * 60 }];

  it("is true inside the block", () => {
    expect(isWithinSchedule(monday9to17, at(1, 12))).toBe(true);
    expect(isWithinSchedule(monday9to17, at(1, 9, 0))).toBe(true);
  });

  it("is false outside the block", () => {
    expect(isWithinSchedule(monday9to17, at(1, 8, 59))).toBe(false);
    expect(isWithinSchedule(monday9to17, at(1, 17, 0))).toBe(false); // end exclusive
    expect(isWithinSchedule(monday9to17, at(2, 12))).toBe(false); // wrong day
  });

  it("handles multiple blocks across days", () => {
    const blocks = [
      { dayOfWeek: 1, startMin: 9 * 60, endMin: 12 * 60 },
      { dayOfWeek: 3, startMin: 14 * 60, endMin: 18 * 60 },
    ];
    expect(isWithinSchedule(blocks, at(1, 10))).toBe(true);
    expect(isWithinSchedule(blocks, at(3, 15))).toBe(true);
    expect(isWithinSchedule(blocks, at(3, 13))).toBe(false);
  });

  it("handles overnight blocks wrapping past midnight", () => {
    // Friday 22:00 → Saturday 02:00
    const overnight = [{ dayOfWeek: 5, startMin: 22 * 60, endMin: 2 * 60 }];
    expect(isWithinSchedule(overnight, at(5, 23))).toBe(true);
    expect(isWithinSchedule(overnight, at(6, 1))).toBe(true);
    expect(isWithinSchedule(overnight, at(6, 3))).toBe(false);
    expect(isWithinSchedule(overnight, at(5, 21))).toBe(false);
  });

  it("handles Saturday→Sunday wraparound", () => {
    const overnight = [{ dayOfWeek: 6, startMin: 23 * 60, endMin: 1 * 60 }];
    expect(isWithinSchedule(overnight, at(0, 0, 30))).toBe(true);
    expect(isWithinSchedule(overnight, at(6, 23, 30))).toBe(true);
  });

  it("is false with no blocks", () => {
    expect(isWithinSchedule([], at(1, 12))).toBe(false);
  });
});

describe("validateBlock", () => {
  it("accepts a valid block", () => {
    expect(validateBlock({ dayOfWeek: 1, startMin: 540, endMin: 1020 })).toBeNull();
  });

  it("rejects bad day", () => {
    expect(validateBlock({ dayOfWeek: 7, startMin: 0, endMin: 60 })).toBeTruthy();
    expect(validateBlock({ dayOfWeek: -1, startMin: 0, endMin: 60 })).toBeTruthy();
  });

  it("rejects out-of-range minutes", () => {
    expect(validateBlock({ dayOfWeek: 1, startMin: -1, endMin: 60 })).toBeTruthy();
    expect(validateBlock({ dayOfWeek: 1, startMin: 0, endMin: 1440 })).toBeTruthy();
    expect(validateBlock({ dayOfWeek: 1, startMin: 0.5, endMin: 60 })).toBeTruthy();
  });

  it("rejects zero-duration blocks", () => {
    expect(validateBlock({ dayOfWeek: 1, startMin: 60, endMin: 60 })).toBeTruthy();
  });
});
