import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { inviteStatus } from "@/lib/invite";

/** Revoke an outstanding invite, killing its link immediately. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const invite = await prisma.providerInvite.findUnique({ where: { id } });
  if (!invite) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (inviteStatus(invite) === "ACCEPTED") {
    return NextResponse.json(
      { error: "Invite was already accepted; disable the provider instead" },
      { status: 409 }
    );
  }
  if (invite.revokedAt) return NextResponse.json({ ok: true });

  await prisma.providerInvite.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
