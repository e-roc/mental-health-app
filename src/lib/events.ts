import { getBus } from "@/lib/pubsub";

/**
 * Typed publish helpers. Events are refetch signals; clients respond by
 * reloading through the authorized REST API. No PII crosses the bus.
 */

export function sessionChannel(sessionId: string): string {
  return `session:${sessionId}`;
}

export function providerChannel(providerUserId: string): string {
  return `provider:${providerUserId}`;
}

export const ADMIN_CHANNEL = "admin";

export async function publishSessionUpdate(sessionId: string): Promise<void> {
  await Promise.all([
    getBus().publish(sessionChannel(sessionId), { type: "session.updated" }),
    getBus().publish(ADMIN_CHANNEL, { type: "sessions.changed" }),
  ]);
}

export async function publishMessage(sessionId: string): Promise<void> {
  await getBus().publish(sessionChannel(sessionId), { type: "message.created" });
}

export async function publishProviderPing(providerUserId: string): Promise<void> {
  await getBus().publish(providerChannel(providerUserId), {
    type: "session.requested",
  });
}

export async function publishRerouted(
  oldSessionId: string,
  newSessionId: string | null
): Promise<void> {
  await getBus().publish(sessionChannel(oldSessionId), {
    type: "session.rerouted",
    newSessionId,
  });
}

export async function publishAdminChange(): Promise<void> {
  await getBus().publish(ADMIN_CHANNEL, { type: "directory.changed" });
}
