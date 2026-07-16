import type { ProviderProfile } from "@prisma/client";

/**
 * Provider ping stub. In production this would send SMS/email/push with the
 * secure join link. For the demo it logs the link; providers also see
 * incoming requests live on their dashboard.
 */
export async function pingProvider(
  provider: ProviderProfile,
  sessionId: string,
  windowMinutes: number
): Promise<void> {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  const link = `${base}/chat/${sessionId}`;
  console.log(
    `[notify] Ping provider ${provider.id}: new chat request. ` +
      `Connect within ${windowMinutes} min: ${link}`
  );
}
