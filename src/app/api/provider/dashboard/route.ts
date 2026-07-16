import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { syncScheduledAvailability } from "@/lib/availability";

/** Provider dashboard data: profile, schedule, pending pings, active sessions. */
export async function GET() {
  const user = await requireRole("PROVIDER");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncScheduledAvailability();

  const profile = await prisma.providerProfile.findUnique({
    where: { userId: user.id },
    include: {
      schedule: { orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }] },
    },
  });
  if (!profile) {
    return NextResponse.json({ error: "No provider profile" }, { status: 404 });
  }

  // Stale pings are expired (and the user re-routed) by the background
  // sweeper in server.ts; the dashboard just reads current state.
  const sessions = await prisma.chatSession.findMany({
    where: { providerId: profile.id, status: { in: ["PENDING", "ACTIVE"] } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    profile: {
      isAvailable: profile.isAvailable,
      useSchedule: profile.useSchedule,
      specialties: profile.specialties,
      bio: profile.bio,
    },
    schedule: profile.schedule.map((b) => ({
      dayOfWeek: b.dayOfWeek,
      startMin: b.startMin,
      endMin: b.endMin,
    })),
    sessions: sessions.map((s) => ({
      id: s.id,
      status: s.status,
      matchType: s.matchType,
      connectBy: s.connectBy,
      createdAt: s.createdAt,
    })),
  });
}
