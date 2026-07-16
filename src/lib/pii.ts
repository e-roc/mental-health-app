import { decrypt } from "@/lib/crypto";
import type { Questionnaire, User } from "@prisma/client";
import {
  questionnaireSchema,
  type ConcernTag,
  type QuestionnaireAnswers,
} from "@/lib/questionnaire";

/** Decryption helpers — keep every decrypt call site in one reviewable module. */

export function userName(user: User): string {
  try {
    return decrypt(user.nameEnc);
  } catch {
    return "(unreadable)";
  }
}

export function userEmail(user: User): string {
  try {
    return decrypt(user.emailEnc);
  } catch {
    return "(unreadable)";
  }
}

export async function getConcernsForQuestionnaire(
  q: Questionnaire
): Promise<ConcernTag[]> {
  try {
    const parsed = JSON.parse(decrypt(q.concernsEnc));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Full decrypted answers, e.g. to prefill an update to a prior submission. */
export async function getAnswersForQuestionnaire(
  q: Questionnaire
): Promise<QuestionnaireAnswers | null> {
  try {
    const parsed = questionnaireSchema.safeParse(JSON.parse(decrypt(q.answersEnc)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
