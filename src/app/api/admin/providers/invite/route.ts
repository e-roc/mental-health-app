import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { blindIndex, encrypt, hashToken, randomToken } from "@/lib/crypto";
import {
  INVITE_TTL_MS,
  inviteCreateSchema,
  inviteUrl,
  isRedeemable,
} from "@/lib/invite";

/**
 * Issue a provider invite. The raw token is returned exactly once, in this
 * response, for the admin to hand to the provider — only its HMAC is stored,
 * so a database read cannot reconstruct a working link.
 */
export async function POST(req: Request) {
  const admin = await requireRole("ADMIN");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = inviteCreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, email } = parsed.data;
  const emailHash = blindIndex(email);

  const existingUser = await prisma.user.findUnique({ where: { emailHash } });
  if (existingUser) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  // Don't stack live invites for the same address; the admin should revoke or
  // wait for the outstanding one rather than minting a second valid link.
  const outstanding = await prisma.providerInvite.findMany({ where: { emailHash } });
  if (outstanding.some((i) => isRedeemable(i))) {
    return NextResponse.json(
      { error: "An unexpired invite for this email already exists" },
      { status: 409 }
    );
  }

  const token = randomToken();
  const invite = await prisma.providerInvite.create({
    data: {
      tokenHash: hashToken(token),
      emailHash,
      emailEnc: encrypt(email),
      nameEnc: encrypt(name),
      invitedById: admin.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  return NextResponse.json({
    id: invite.id,
    expiresAt: invite.expiresAt,
    inviteUrl: inviteUrl(token),
  });
}
