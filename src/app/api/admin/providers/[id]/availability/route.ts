import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { publishAdminChange } from "@/lib/events";

const schema = z.object({
  isAvailable: z.boolean().optional(),
  useSchedule: z.boolean().optional(),
});

/**
 * Admin override of a provider's availability.
 *
 * Forcing isAvailable also drops the provider out of schedule mode — otherwise
 * the next syncScheduledAvailability() would silently undo the override. Same
 * rule the provider's own manual toggle follows.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || (parsed.data.isAvailable === undefined && parsed.data.useSchedule === undefined)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const profile = await prisma.providerProfile.findUnique({ where: { id } });
  if (!profile) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const data: { isAvailable?: boolean; useSchedule?: boolean } = {};
  if (parsed.data.useSchedule !== undefined) data.useSchedule = parsed.data.useSchedule;
  if (parsed.data.isAvailable !== undefined) {
    data.isAvailable = parsed.data.isAvailable;
    data.useSchedule = false;
  }

  const updated = await prisma.providerProfile.update({ where: { id }, data });

  console.log(
    `[audit] admin=${admin.id} set provider=${id} ` +
      `isAvailable=${updated.isAvailable} useSchedule=${updated.useSchedule}`
  );
  await publishAdminChange();

  return NextResponse.json({
    isAvailable: updated.isAvailable,
    useSchedule: updated.useSchedule,
  });
}
