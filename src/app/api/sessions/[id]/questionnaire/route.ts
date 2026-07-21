import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAnswersForQuestionnaire } from "@/lib/pii";

/**
 * The intake questionnaire linked to a chat session. Either participant (the
 * patient or the assigned provider) may read it. Decryption of the answers
 * lives here alone — it is intentionally not part of the polled session GET.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: { provider: true, questionnaire: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isUser = session.userId === user.id;
  const isProvider = session.provider.userId === user.id;
  if (!isUser && !isProvider) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!session.questionnaire) {
    return NextResponse.json({ questionnaire: null });
  }

  const answers = await getAnswersForQuestionnaire(session.questionnaire);
  return NextResponse.json({
    questionnaire: {
      answers,
      riskLevel: session.questionnaire.riskLevel,
      createdAt: session.questionnaire.createdAt,
    },
  });
}
