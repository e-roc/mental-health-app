import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { userName } from "@/lib/pii";
import { expireAndRereoute } from "@/lib/router";

/**
 * Session status + messages. Only the two participants may read message
 * content; admins see session metadata via the admin API, never bodies.
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

  let session = await prisma.chatSession.findUnique({
    where: { id },
    include: { provider: { include: { user: true } }, user: true },
  });
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isUser = session.userId === user.id;
  const isProvider = session.provider.userId === user.id;
  if (!isUser && !isProvider) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // A human just opened the chat as this (possibly AI-test) provider —
  // permanently hand the provider side over to them for this session.
  if (isProvider && session.provider.isAI && !session.humanTakeover) {
    await prisma.chatSession.update({
      where: { id: session.id },
      data: { humanTakeover: true },
    });
    session.humanTakeover = true;
  }

  // Lazy expiry: if the provider missed the connect window, re-route the
  // user to the next available provider.
  if (isUser && session.status === "PENDING" && session.connectBy <= new Date()) {
    const next = await expireAndRereoute(session.id);
    if (next.id !== session.id) {
      return NextResponse.json({ rerouted: true, sessionId: next.id });
    }
    session = await prisma.chatSession.findUniqueOrThrow({
      where: { id },
      include: { provider: { include: { user: true } }, user: true },
    });
  }

  const messages = await prisma.message.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    id: session.id,
    status: session.status,
    connectBy: session.connectBy,
    counterpartName: isUser ? userName(session.provider.user) : userName(session.user),
    viewerId: user.id,
    viewerRole: isUser ? "user" : "provider",
    // Lets the provider UI show "you've taken over from the AI" once relevant.
    aiTakeover: isProvider && session.provider.isAI && session.humanTakeover,
    // Tri-state, not a boolean: rows closed before closedById existed have no
    // recorded closer, and a boolean would render that as "they ended it".
    closedBy:
      session.status !== "CLOSED" || !session.closedById
        ? null
        : session.closedById === user.id
          ? "me"
          : "them",
    messages: messages.map((m) => ({
      id: m.id,
      mine: m.senderId === user.id,
      body: safeDecrypt(m.bodyEnc),
      createdAt: m.createdAt,
    })),
  });
}

function safeDecrypt(payload: string): string {
  try {
    return decrypt(payload);
  } catch {
    return "(unreadable message)";
  }
}
