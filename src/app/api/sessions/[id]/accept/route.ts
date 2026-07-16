import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { publishSessionUpdate } from "@/lib/events";

/** Provider accepts a pending session (must beat the connect deadline). */
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

  // Conditional update: if the sweeper expired this session a moment ago on
  // another instance, accept loses cleanly instead of resurrecting it.
  const accepted = await prisma.chatSession.updateMany({
    where: { id: session.id, status: "PENDING" },
    data: { status: "ACTIVE", acceptedAt: new Date() },
  });
  if (accepted.count === 0) {
    return NextResponse.json(
      { error: "Session is no longer pending" },
      { status: 409 }
    );
  }
  await publishSessionUpdate(session.id);
  return NextResponse.json({ ok: true });
}
