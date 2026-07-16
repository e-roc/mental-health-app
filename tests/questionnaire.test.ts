import { describe, expect, it } from "vitest";
import {
  questionnaireSchema,
  scoreRisk,
  type QuestionnaireAnswers,
} from "@/lib/questionnaire";

const base: QuestionnaireAnswers = {
  concerns: ["anxiety"],
  moodFrequency: "not-at-all",
  anxietyFrequency: "not-at-all",
  sleepQuality: "good",
  priorSupport: "no",
  safetyConcern: "no",
  additionalNotes: "",
};

describe("scoreRisk", () => {
  it("returns HIGH whenever there is a safety concern, regardless of other answers", () => {
    expect(scoreRisk({ ...base, safetyConcern: "yes" })).toBe("HIGH");
  });

  it("returns LOW for minimal symptoms", () => {
    expect(scoreRisk(base)).toBe("LOW");
  });

  it("returns MODERATE for frequent symptoms", () => {
    expect(
      scoreRisk({
        ...base,
        moodFrequency: "nearly-every-day",
        anxietyFrequency: "more-than-half",
      })
    ).toBe("MODERATE");
  });

  it("counts poor sleep toward the score", () => {
    expect(
      scoreRisk({
        ...base,
        moodFrequency: "more-than-half",
        anxietyFrequency: "several-days",
        sleepQuality: "poor",
      })
    ).toBe("MODERATE");
  });
});

describe("questionnaireSchema", () => {
  it("accepts valid answers", () => {
    expect(questionnaireSchema.safeParse(base).success).toBe(true);
  });

  it("requires at least one concern", () => {
    expect(questionnaireSchema.safeParse({ ...base, concerns: [] }).success).toBe(false);
  });

  it("rejects unknown concern tags", () => {
    expect(
      questionnaireSchema.safeParse({ ...base, concerns: ["hacking"] }).success
    ).toBe(false);
  });

  it("rejects oversized notes", () => {
    expect(
      questionnaireSchema.safeParse({ ...base, additionalNotes: "x".repeat(2001) })
        .success
    ).toBe(false);
  });

  it("defaults missing notes to empty string", () => {
    const rest: Partial<QuestionnaireAnswers> = { ...base };
    delete rest.additionalNotes;
    const parsed = questionnaireSchema.parse(rest);
    expect(parsed.additionalNotes).toBe("");
  });
});
