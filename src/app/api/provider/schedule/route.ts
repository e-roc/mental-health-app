import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { syncScheduledAvailability, validateBlock } from "@/lib/availability";

const blockSchema = z.object({
  dayOfWeek: z.number().int(),
  startMin: z.number().int(),
  endMin: z.number().int(),
});
const schema = z.object({ blocks: z.array(blockSchema).max(50) });

/** Replace the provider's full weekly schedule. */
export async function PUT(req: Request) {
  const user = await requireRole("PROVIDER");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  for (const block of parsed.data.blocks) {
    const err = validateBlock(block);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  const profile = await prisma.providerProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) {
    return NextResponse.json({ error: "No provider profile" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.scheduleBlock.deleteMany({ where: { providerId: profile.id } }),
    prisma.scheduleBlock.createMany({
      data: parsed.data.blocks.map((b) => ({ ...b, providerId: profile.id })),
    }),
  ]);
  await syncScheduledAvailability();

  const blocks = await prisma.scheduleBlock.findMany({
    where: { providerId: profile.id },
    orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }],
  });
  return NextResponse.json({ blocks });
}
