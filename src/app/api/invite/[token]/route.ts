import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt, hashToken } from "@/lib/crypto";
import { inviteStatus } from "@/lib/invite";

/**
 * Public: validate an invite token so the accept page can greet the invitee.
 * Reveals only the name/email the admin already typed for this exact token —
 * an unknown or dead token reveals nothing.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const invite = await prisma.providerInvite.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!invite) {
    return NextResponse.json({ error: "This invite link is not valid" }, { status: 404 });
  }

  const status = inviteStatus(invite);
  if (status !== "PENDING") {
    return NextResponse.json(
      { error: MESSAGES[status] },
      { status: status === "ACCEPTED" ? 409 : 410 }
    );
  }

  return NextResponse.json({
    name: decrypt(invite.nameEnc),
    email: decrypt(invite.emailEnc),
    expiresAt: invite.expiresAt,
  });
}

const MESSAGES: Record<string, string> = {
  ACCEPTED: "This invite has already been used. Try logging in instead.",
  REVOKED: "This invite was revoked. Ask your administrator for a new link.",
  EXPIRED: "This invite has expired. Ask your administrator for a new link.",
};
