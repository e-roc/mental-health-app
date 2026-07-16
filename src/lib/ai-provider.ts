import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/crypto";
import { publishMessage } from "@/lib/events";

/**
 * Demo AI test providers. They accept sessions immediately and send canned
 * supportive replies so the full user flow can be exercised without a real
 * human on the other end. Real providers go through the ping/accept flow.
 */

const GREETING =
  "Hi, thanks for reaching out today. I've read through your intake " +
  "responses. This is a safe space — what feels most pressing for you right now?";

const REPLIES = [
  "Thank you for sharing that. Can you tell me a bit more about when you first started noticing this?",
  "That sounds really difficult. How has this been affecting your day-to-day life?",
  "It takes courage to talk about this. What kinds of things have helped you cope so far, even a little?",
  "I hear you. Let's take this one step at a time — what would feeling a bit better look like for you this week?",
  "That's understandable. Would it help to explore some strategies together for managing those moments?",
];

export async function aiAcceptSession(
  sessionId: string,
  aiUserId: string
): Promise<void> {
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { status: "ACTIVE", acceptedAt: new Date() },
  });
  await prisma.message.create({
    data: { sessionId, senderId: aiUserId, bodyEnc: encrypt(GREETING) },
  });
  await publishMessage(sessionId);
}

/**
 * Called after a user message lands in a session owned by an AI provider.
 * Stays silent once a human has taken over the provider side (see
 * humanTakeover on ChatSession) so canned replies don't talk over them.
 */
export async function aiMaybeReply(sessionId: string): Promise<void> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { provider: { include: { user: true } } },
  });
  if (
    !session ||
    !session.provider.isAI ||
    session.status !== "ACTIVE" ||
    session.humanTakeover
  ) {
    return;
  }

  const count = await prisma.message.count({
    where: { sessionId, senderId: session.provider.userId },
  });
  const reply = REPLIES[(count - 1 + REPLIES.length) % REPLIES.length];
  await prisma.message.create({
    data: {
      sessionId,
      senderId: session.provider.userId,
      bodyEnc: encrypt(reply),
    },
  });
  await publishMessage(sessionId);
}
