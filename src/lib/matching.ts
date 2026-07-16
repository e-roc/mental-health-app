import type { ConcernTag } from "@/lib/questionnaire";

export interface CandidateProvider {
  id: string;
  specialties: string[]; // parsed specialty tags
}

export interface MatchResult {
  providerId: string;
  matchType: "MATCHED" | "RANDOM_FALLBACK";
}

/**
 * Stubbed matching criteria: score each available provider by specialty
 * overlap with the user's questionnaire concerns. Highest overlap wins;
 * ties broken by the injected RNG. Falls back to a random available
 * provider when nobody overlaps. Returns null when nobody is available.
 *
 * Extend here later: language, modality, past-session continuity, load
 * balancing, etc.
 */
export function matchProvider(
  concerns: ConcernTag[],
  candidates: CandidateProvider[],
  rng: () => number = Math.random
): MatchResult | null {
  if (candidates.length === 0) return null;

  const concernSet = new Set<string>(concerns);
  let best: CandidateProvider[] = [];
  let bestScore = 0;

  for (const c of candidates) {
    const score = c.specialties.filter((s) => concernSet.has(s)).length;
    if (score > bestScore) {
      bestScore = score;
      best = [c];
    } else if (score === bestScore && score > 0) {
      best.push(c);
    }
  }

  if (bestScore > 0) {
    const pick = best[Math.floor(rng() * best.length)];
    return { providerId: pick.id, matchType: "MATCHED" };
  }

  const pick = candidates[Math.floor(rng() * candidates.length)];
  return { providerId: pick.id, matchType: "RANDOM_FALLBACK" };
}
