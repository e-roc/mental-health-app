import { prisma } from "@/lib/db";

export interface ScheduleBlockInput {
  dayOfWeek: number; // 0 = Sunday ... 6 = Saturday
  startMin: number; // minutes since midnight, inclusive
  endMin: number; // exclusive
}

/**
 * Pure schedule evaluation (server-local time). Blocks with endMin <= startMin
 * are treated as overnight blocks wrapping past midnight.
 */
export function isWithinSchedule(
  blocks: ScheduleBlockInput[],
  now: Date
): boolean {
  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return blocks.some((b) => {
    if (b.endMin > b.startMin) {
      return b.dayOfWeek === day && minutes >= b.startMin && minutes < b.endMin;
    }
    // Overnight block: covers [startMin, midnight) on its day and
    // [midnight, endMin) on the following day.
    const prevDay = (b.dayOfWeek + 1) % 7;
    return (
      (b.dayOfWeek === day && minutes >= b.startMin) ||
      (prevDay === day && minutes < b.endMin)
    );
  });
}

export function validateBlock(b: ScheduleBlockInput): string | null {
  if (!Number.isInteger(b.dayOfWeek) || b.dayOfWeek < 0 || b.dayOfWeek > 6) {
    return "dayOfWeek must be 0-6";
  }
  const validMin = (m: number) => Number.isInteger(m) && m >= 0 && m < 24 * 60;
  if (!validMin(b.startMin) || !validMin(b.endMin)) {
    return "startMin/endMin must be 0-1439";
  }
  if (b.startMin === b.endMin) return "block must have non-zero duration";
  return null;
}

/**
 * For providers with useSchedule=true, recompute isAvailable from their
 * schedule and persist any change. This "automatically switches the flag":
 * it runs lazily whenever availability matters (routing, dashboards, admin).
 */
export async function syncScheduledAvailability(now = new Date()): Promise<void> {
  const scheduled = await prisma.providerProfile.findMany({
    where: { useSchedule: true },
    include: { schedule: true },
  });
  const updates = scheduled
    .filter((p) => isWithinSchedule(p.schedule, now) !== p.isAvailable)
    .map((p) =>
      prisma.providerProfile.update({
        where: { id: p.id },
        data: { isAvailable: isWithinSchedule(p.schedule, now) },
      })
    );
  if (updates.length) await prisma.$transaction(updates);
}
