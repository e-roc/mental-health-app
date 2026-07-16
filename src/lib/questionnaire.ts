import { z } from "zod";

/**
 * Intake questionnaire definition. Single source of truth for the form UI,
 * API validation, concern-tag extraction, and risk scoring.
 */

export const CONCERN_TAGS = [
  "anxiety",
  "depression",
  "stress",
  "sleep",
  "relationships",
  "grief",
  "trauma",
  "substance-use",
] as const;

export type ConcernTag = (typeof CONCERN_TAGS)[number];

/** Shared user-facing copy for concern tags — intake form and its summaries. */
export const CONCERN_LABELS: Record<ConcernTag, string> = {
  anxiety: "Anxiety",
  depression: "Depression",
  stress: "Stress or burnout",
  sleep: "Sleep problems",
  relationships: "Relationship difficulties",
  grief: "Grief or loss",
  trauma: "Trauma",
  "substance-use": "Substance use",
};

export const FREQUENCY_OPTIONS = [
  "not-at-all",
  "several-days",
  "more-than-half",
  "nearly-every-day",
] as const;

const FREQUENCY_SCORE: Record<(typeof FREQUENCY_OPTIONS)[number], number> = {
  "not-at-all": 0,
  "several-days": 1,
  "more-than-half": 2,
  "nearly-every-day": 3,
};

export const questionnaireSchema = z.object({
  concerns: z
    .array(z.enum(CONCERN_TAGS))
    .min(1, "Select at least one concern"),
  moodFrequency: z.enum(FREQUENCY_OPTIONS),
  anxietyFrequency: z.enum(FREQUENCY_OPTIONS),
  sleepQuality: z.enum(["good", "fair", "poor"]),
  priorSupport: z.enum(["yes", "no"]),
  safetyConcern: z.enum(["yes", "no"]),
  additionalNotes: z.string().max(2000).optional().default(""),
});

export type QuestionnaireAnswers = z.infer<typeof questionnaireSchema>;

export type RiskLevel = "LOW" | "MODERATE" | "HIGH";

/**
 * Stubbed risk scoring. A safety concern is always HIGH; otherwise a simple
 * symptom-frequency sum decides LOW vs MODERATE.
 */
export function scoreRisk(answers: QuestionnaireAnswers): RiskLevel {
  if (answers.safetyConcern === "yes") return "HIGH";
  const score =
    FREQUENCY_SCORE[answers.moodFrequency] +
    FREQUENCY_SCORE[answers.anxietyFrequency] +
    (answers.sleepQuality === "poor" ? 2 : answers.sleepQuality === "fair" ? 1 : 0);
  return score >= 5 ? "MODERATE" : "LOW";
}
