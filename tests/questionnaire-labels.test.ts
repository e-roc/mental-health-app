import { describe, expect, it } from "vitest";
import {
  FREQUENCY_OPTIONS,
  FREQUENCY_LABELS,
  SLEEP_LABELS,
  YES_NO_LABELS,
  FIELD_LABELS,
} from "@/lib/questionnaire";

describe("questionnaire label maps", () => {
  it("labels every frequency option", () => {
    for (const opt of FREQUENCY_OPTIONS) {
      expect(FREQUENCY_LABELS[opt]).toBeTruthy();
    }
  });

  it("labels sleep, yes/no, and every answer field", () => {
    expect(Object.keys(SLEEP_LABELS).sort()).toEqual(["fair", "good", "poor"]);
    expect(Object.keys(YES_NO_LABELS).sort()).toEqual(["no", "yes"]);
    expect(FIELD_LABELS.moodFrequency).toBeTruthy();
    expect(FIELD_LABELS.anxietyFrequency).toBeTruthy();
    expect(FIELD_LABELS.sleepQuality).toBeTruthy();
    expect(FIELD_LABELS.priorSupport).toBeTruthy();
    expect(FIELD_LABELS.safetyConcern).toBeTruthy();
    expect(FIELD_LABELS.additionalNotes).toBeTruthy();
  });
});
