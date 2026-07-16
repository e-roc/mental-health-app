import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getConcernsForQuestionnaire } from "@/lib/pii";
import { routeUserToProvider } from "@/lib/router";
import { rateLimitOr429 } from "@/lib/ratelimit";

/**
 * Connect a returning user to a provider using their most recent saved
 * questionnaire, skipping re-entry. Reuses that questionnaire's id rather
 * than duplicating a new encrypted row.
 */
export async function POST(req: Request) {
  const user = await requireRole("USER");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitOr429(
    req,
    "questionnaire-connect",
    { limit: 5, windowMs: 60_000 },
    user.id
  );
  if (limited) return limited;

  const questionnaire = await prisma.questionnaire.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  if (!questionnaire) {
    return NextResponse.json(
      { error: "No questionnaire on file. Please complete it first." },
      { status: 404 }
    );
  }

  const concerns = await getConcernsForQuestionnaire(questionnaire);
  const session = await routeUserToProvider({
    userId: user.id,
    questionnaireId: questionnaire.id,
    concerns,
  });

  if (!session) {
    return NextResponse.json({
      ok: true,
      sessionId: null,
      message:
        "No providers are available right now. Please try again shortly.",
    });
  }

  return NextResponse.json({ ok: true, sessionId: session.id });
}
