import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { aiMaybeReply } from "@/lib/ai-provider";
import { publishMessage } from "@/lib/events";
import { rateLimitOr429 } from "@/lib/ratelimit";

const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = rateLimitOr429(
    req,
    "messages",
    { limit: 30, windowMs: 10_000 },
    user.id
  );
  if (limited) return limited;

  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: { provider: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const isParticipant =
    session.userId === user.id || session.provider.userId === user.id;
  if (!isParticipant) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "Session is not active" },
      { status: 409 }
    );
  }

  const parsed = messageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  await prisma.message.create({
    data: {
      sessionId: session.id,
      senderId: user.id,
      bodyEnc: encrypt(parsed.data.body),
    },
  });
  await publishMessage(session.id);

  // Demo AI providers reply immediately to user messages.
  if (session.userId === user.id) {
    await aiMaybeReply(session.id);
  }

  return NextResponse.json({ ok: true });
}
