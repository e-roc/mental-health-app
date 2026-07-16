import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { syncScheduledAvailability } from "@/lib/availability";
import { publishAdminChange } from "@/lib/events";

const schema = z.object({
  // Setting isAvailable directly implies manual mode (useSchedule=false).
  // Setting useSchedule=true hands the flag over to the schedule.
  isAvailable: z.boolean().optional(),
  useSchedule: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await requireRole("PROVIDER");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const profile = await prisma.providerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) {
    return NextResponse.json({ error: "No provider profile" }, { status: 404 });
  }

  const data: { isAvailable?: boolean; useSchedule?: boolean } = {};
  if (parsed.data.useSchedule !== undefined) {
    data.useSchedule = parsed.data.useSchedule;
  }
  if (parsed.data.isAvailable !== undefined) {
    data.isAvailable = parsed.data.isAvailable;
    data.useSchedule = false;
  }

  await prisma.providerProfile.update({ where: { id: profile.id }, data });
  // If schedule mode was just enabled, compute the flag right away.
  await syncScheduledAvailability();

  const updated = await prisma.providerProfile.findUniqueOrThrow({
    where: { id: profile.id },
  });
  await publishAdminChange();
  return NextResponse.json({
    isAvailable: updated.isAvailable,
    useSchedule: updated.useSchedule,
  });
}
