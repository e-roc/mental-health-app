import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { publishMessage, publishSessionUpdate } from "@/lib/events";

// Same bounds as a normal chat message (see messages/route.ts). Trimmed empty
// is rejected — the block-join rule requires a real greeting on connect.
const acceptSchema = z.object({ message: z.string().trim().min(1).max(4000) });

/** Provider accepts a pending session (must beat the connect deadline). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.chatSession.findUnique({
    where: { id },
    include: { provider: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (session.provider.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (session.status !== "PENDING") {
    return NextResponse.json(
      { error: `Session is ${session.status.toLowerCase()}` },
      { status: 409 }
    );
  }
  if (session.connectBy <= new Date()) {
    await prisma.chatSession.updateMany({
      where: { id: session.id, status: "PENDING" },
      data: { status: "EXPIRED", closedAt: new Date() },
    });
    await publishSessionUpdate(session.id);
    return NextResponse.json(
      { error: "Connect window expired" },
      { status: 410 }
    );
  }

  const parsed = acceptSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  // Claim and greeting are one transaction: block-join guarantees every human
  // connect carries a first message, so an ACTIVE session must never be left
  // without one. The claim stays conditional on PENDING — if the sweeper
  // expired this session a moment ago on another instance, accept rolls back
  // cleanly instead of resurrecting it or writing an orphaned message.
  const claimed = await prisma.$transaction(async (tx) => {
    const accepted = await tx.chatSession.updateMany({
      where: { id: session.id, status: "PENDING" },
      data: { status: "ACTIVE", acceptedAt: new Date() },
    });
    if (accepted.count === 0) return false;
    await tx.message.create({
      data: {
        sessionId: session.id,
        senderId: user.id,
        bodyEnc: encrypt(parsed.data.message),
      },
    });
    return true;
  });
  if (!claimed) {
    return NextResponse.json(
      { error: "Session is no longer pending" },
      { status: 409 }
    );
  }
  await publishSessionUpdate(session.id);
  await publishMessage(session.id);
  return NextResponse.json({ ok: true });
}
