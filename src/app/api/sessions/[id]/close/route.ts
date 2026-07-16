import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { publishSessionUpdate } from "@/lib/events";

/** Either participant may end an active or pending session. */
export async function POST(
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
  if (session.status === "CLOSED" || session.status === "EXPIRED") {
    return NextResponse.json({ ok: true });
  }

  await prisma.chatSession.updateMany({
    where: { id: session.id, status: { in: ["PENDING", "ACTIVE"] } },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await publishSessionUpdate(session.id);
  return NextResponse.json({ ok: true });
}
