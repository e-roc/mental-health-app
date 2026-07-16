import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { questionnaireSchema, scoreRisk } from "@/lib/questionnaire";
import { routeUserToProvider } from "@/lib/router";
import { rateLimitOr429 } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const user = await requireRole("USER");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitOr429(
    req,
    "questionnaire",
    { limit: 5, windowMs: 60_000 },
    user.id
  );
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = questionnaireSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const answers = parsed.data;

  const questionnaire = await prisma.questionnaire.create({
    data: {
      userId: user.id,
      answersEnc: encrypt(JSON.stringify(answers)),
      concernsEnc: encrypt(JSON.stringify(answers.concerns)),
      riskLevel: scoreRisk(answers),
    },
  });

  const session = await routeUserToProvider({
    userId: user.id,
    questionnaireId: questionnaire.id,
    concerns: answers.concerns,
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
