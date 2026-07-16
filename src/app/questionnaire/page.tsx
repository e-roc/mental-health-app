import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getAnswersForQuestionnaire } from "@/lib/pii";
import { QuestionnaireIntake } from "@/components/QuestionnaireIntake";

export default async function QuestionnairePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "USER") redirect("/");

  const latest = await prisma.questionnaire.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  const answers = latest ? await getAnswersForQuestionnaire(latest) : null;

  return (
    <QuestionnaireIntake
      previous={
        latest && answers
          ? { answers, submittedAt: latest.createdAt.toISOString() }
          : null
      }
    />
  );
}
