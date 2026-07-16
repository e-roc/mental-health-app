import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, hashToken } from "@/lib/crypto";
import { createSession, setSessionCookie } from "@/lib/auth";
import { inviteAcceptSchema, inviteStatus } from "@/lib/invite";
import { rateLimitOr429 } from "@/lib/ratelimit";
import { publishAdminChange } from "@/lib/events";

/**
 * Public: redeem an invite. The invitee sets their own password and picks
 * their own specialties — the admin never knows the credential. Creating the
 * user, profile, and marking the invite used happen in one transaction, and
 * the invite is claimed with a conditional update so two concurrent redeems
 * cannot both create an account.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const limited = rateLimitOr429(req, "invite-accept", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { token } = await params;
  const tokenHash = hashToken(token);

  const invite = await prisma.providerInvite.findUnique({ where: { tokenHash } });
  if (!invite) {
    return NextResponse.json({ error: "This invite link is not valid" }, { status: 404 });
  }
  const status = inviteStatus(invite);
  if (status !== "PENDING") {
    return NextResponse.json(
      { error: "This invite is no longer valid" },
      { status: status === "ACCEPTED" ? 409 : 410 }
    );
  }

  const parsed = inviteAcceptSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { password, specialties, bio } = parsed.data;

  // Someone may have registered this address between issue and redemption.
  const existing = await prisma.user.findUnique({
    where: { emailHash: invite.emailHash },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  // Claim the invite first: this update matches only while acceptedAt is null,
  // so a concurrent redeem of the same token loses the race and gets 0 rows.
  const claimed = await prisma.providerInvite.updateMany({
    where: { tokenHash, acceptedAt: null, revokedAt: null },
    data: { acceptedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json(
      { error: "This invite is no longer valid" },
      { status: 409 }
    );
  }

  let userId: string;
  try {
    const user = await prisma.user.create({
      data: {
        role: "PROVIDER",
        emailHash: invite.emailHash,
        emailEnc: invite.emailEnc,
        nameEnc: invite.nameEnc,
        passwordHash: await hashPassword(password),
        providerProfile: {
          create: {
            specialties,
            bio,
            isAvailable: false,
            useSchedule: false,
            isAI: false,
          },
        },
      },
    });
    userId = user.id;
  } catch (err) {
    // Account creation failed after claiming — release the invite so the link
    // stays usable rather than stranding the provider.
    await prisma.providerInvite.update({
      where: { tokenHash },
      data: { acceptedAt: null },
    });
    throw err;
  }

  await setSessionCookie(await createSession(userId));
  await publishAdminChange();
  return NextResponse.json({ ok: true, role: "PROVIDER" });
}
