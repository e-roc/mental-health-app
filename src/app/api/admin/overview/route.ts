import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { syncScheduledAvailability } from "@/lib/availability";
import { userEmail, userName } from "@/lib/pii";
import { decrypt } from "@/lib/crypto";
import { inviteStatus } from "@/lib/invite";
import { getConnectWindowMinutes } from "@/lib/settings";

/**
 * Admin overview: users, providers, sessions, settings. Session metadata
 * only — message content is never exposed here.
 */
export async function GET() {
  const admin = await requireRole("ADMIN");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncScheduledAvailability();

  const [users, providers, sessions, invites, allowedEmails, connectWindowMinutes] = await Promise.all([
    prisma.user.findMany({
      where: { role: "USER" },
      orderBy: { createdAt: "desc" },
      include: { questionnaires: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.providerProfile.findMany({
      include: {
        user: true,
        _count: { select: { sessions: { where: { status: "ACTIVE" } } } },
      },
    }),
    prisma.chatSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { user: true, provider: { include: { user: true } } },
    }),
    prisma.providerInvite.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.allowedEmail.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    getConnectWindowMinutes(),
  ]);

  return NextResponse.json({
    settings: { connectWindowMinutes },
    // The invite link itself is never re-served — only its status. A leaked
    // admin session must not be able to harvest live invite links.
    invites: invites.map((i) => ({
      id: i.id,
      name: decrypt(i.nameEnc),
      email: decrypt(i.emailEnc),
      status: inviteStatus(i),
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    })),
    allowedEmails: allowedEmails.map((a) => ({
      id: a.id,
      email: decrypt(a.emailEnc),
      createdAt: a.createdAt,
    })),
    users: users.map((u) => ({
      id: u.id,
      name: userName(u),
      email: userEmail(u),
      createdAt: u.createdAt,
      lastRiskLevel: u.questionnaires[0]?.riskLevel ?? null,
    })),
    providers: providers.map((p) => ({
      id: p.id,
      name: userName(p.user),
      email: userEmail(p.user),
      specialties: p.specialties,
      isAvailable: p.isAvailable,
      useSchedule: p.useSchedule,
      isAI: p.isAI,
      activeSessions: p._count.sessions,
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      userName: userName(s.user),
      providerName: userName(s.provider.user),
      status: s.status,
      matchType: s.matchType,
      connectBy: s.connectBy,
      createdAt: s.createdAt,
      acceptedAt: s.acceptedAt,
      closedAt: s.closedAt,
    })),
  });
}
