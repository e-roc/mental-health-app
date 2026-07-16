import { prisma } from "@/lib/db";
import { Prisma, type ChatSession } from "@prisma/client";
import { syncScheduledAvailability } from "@/lib/availability";
import { matchProvider } from "@/lib/matching";
import { getConnectWindowMinutes } from "@/lib/settings";
import { pingProvider } from "@/lib/notify";
import { aiAcceptSession } from "@/lib/ai-provider";
import { getConcernsForQuestionnaire } from "@/lib/pii";
import {
  publishProviderPing,
  publishRerouted,
  publishSessionUpdate,
} from "@/lib/events";
import type { ConcernTag } from "@/lib/questionnaire";

/**
 * Route a user to an available provider: create a PENDING chat session with a
 * connect deadline and ping the provider with their join link. AI demo
 * providers accept immediately so the flow is testable end-to-end.
 *
 * Concurrency: a partial unique index guarantees at most one PENDING/ACTIVE
 * session per provider. Routing is a claim loop — try the best match, and if
 * a concurrent request claimed that provider first (unique violation), drop
 * them from the candidate pool and re-match. No locks, safe across instances.
 */
export async function routeUserToProvider(opts: {
  userId: string;
  questionnaireId: string;
  concerns: ConcernTag[];
  excludeProviderIds?: string[];
}): Promise<ChatSession | null> {
  await syncScheduledAvailability();

  const pool = await prisma.providerProfile.findMany({
    where: {
      isAvailable: true,
      id: { notIn: opts.excludeProviderIds ?? [] },
      sessions: { none: { status: { in: ["PENDING", "ACTIVE"] } } },
    },
    select: { id: true, specialties: true, isAI: true, userId: true },
  });

  const windowMinutes = await getConnectWindowMinutes();
  const candidates = pool.map((c) => ({ id: c.id, specialties: c.specialties }));

  while (candidates.length > 0) {
    const match = matchProvider(opts.concerns, candidates);
    if (!match) return null;
    const chosen = pool.find((p) => p.id === match.providerId)!;

    try {
      const session = await prisma.chatSession.create({
        data: {
          userId: opts.userId,
          providerId: match.providerId,
          questionnaireId: opts.questionnaireId,
          status: "PENDING",
          matchType: match.matchType,
          connectBy: new Date(Date.now() + windowMinutes * 60 * 1000),
        },
        include: { provider: true },
      });

      await pingProvider(session.provider, session.id, windowMinutes);
      await publishProviderPing(chosen.userId);

      if (session.provider.isAI) {
        await aiAcceptSession(session.id, session.provider.userId);
      }
      await publishSessionUpdate(session.id);
      return session;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Lost the race for this provider; try the next-best candidate.
        const idx = candidates.findIndex((c) => c.id === match.providerId);
        if (idx >= 0) candidates.splice(idx, 1);
        continue;
      }
      throw err;
    }
  }
  return null;
}

/**
 * Expire a PENDING session whose connect window has lapsed and try the next
 * provider. Called by the background sweeper and lazily from the user's
 * session GET. Uses a conditional update as the claim so concurrent callers
 * (sweeper + user poll) can't both re-route. Returns the session the user
 * should now be attached to.
 */
export async function expireAndRereoute(sessionId: string): Promise<ChatSession> {
  const session = await prisma.chatSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { questionnaire: true },
  });
  if (session.status !== "PENDING" || session.connectBy > new Date()) {
    return session;
  }

  const claimed = await prisma.chatSession.updateMany({
    where: { id: session.id, status: "PENDING" },
    data: { status: "EXPIRED", closedAt: new Date() },
  });
  if (claimed.count === 0) {
    // Another worker expired it first; report current state.
    return prisma.chatSession.findUniqueOrThrow({ where: { id: sessionId } });
  }
  await publishSessionUpdate(session.id);

  // Skip every provider this user has already been routed to for this
  // questionnaire (they missed the window or the session died).
  const prior = await prisma.chatSession.findMany({
    where: { userId: session.userId, questionnaireId: session.questionnaireId },
    select: { providerId: true },
  });

  const concerns = session.questionnaire
    ? await getConcernsForQuestionnaire(session.questionnaire)
    : [];

  const next = session.questionnaireId
    ? await routeUserToProvider({
        userId: session.userId,
        questionnaireId: session.questionnaireId,
        concerns,
        excludeProviderIds: prior.map((p) => p.providerId),
      })
    : null;

  await publishRerouted(session.id, next?.id ?? null);
  return next ?? { ...session, status: "EXPIRED" };
}

/**
 * Background sweep: expire and re-route every PENDING session past its
 * connect window. Runs on an interval in server.ts, replacing reliance on
 * the user's browser polling to notice the deadline.
 */
export async function sweepExpiredSessions(): Promise<number> {
  const stale = await prisma.chatSession.findMany({
    where: { status: "PENDING", connectBy: { lte: new Date() } },
    select: { id: true },
    take: 100,
  });
  for (const s of stale) {
    try {
      await expireAndRereoute(s.id);
    } catch (err) {
      console.error(`[router] sweep failed for session ${s.id}`, err);
    }
  }
  return stale.length;
}
