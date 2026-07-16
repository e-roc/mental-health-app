import { prisma } from "@/lib/db";

export const SETTING_KEYS = {
  connectWindowMinutes: "connectWindowMinutes",
} as const;

export const DEFAULT_CONNECT_WINDOW_MINUTES = 5;

export async function getConnectWindowMinutes(): Promise<number> {
  const row = await prisma.setting.findUnique({
    where: { key: SETTING_KEYS.connectWindowMinutes },
  });
  const parsed = row ? parseInt(row.value, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_CONNECT_WINDOW_MINUTES;
}

export async function setConnectWindowMinutes(minutes: number): Promise<void> {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) {
    throw new Error("connectWindowMinutes must be an integer between 1 and 1440");
  }
  await prisma.setting.upsert({
    where: { key: SETTING_KEYS.connectWindowMinutes },
    create: { key: SETTING_KEYS.connectWindowMinutes, value: String(minutes) },
    update: { value: String(minutes) },
  });
}
