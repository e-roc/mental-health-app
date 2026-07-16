import { z } from "zod";
import { CONCERN_TAGS } from "@/lib/questionnaire";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Specialties are drawn from the same vocabulary the matcher scores against. */
export const specialtiesSchema = z
  .array(z.enum(CONCERN_TAGS))
  .min(1, "Select at least one focus area")
  .max(CONCERN_TAGS.length);

export const inviteCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
});

export const inviteAcceptSchema = z.object({
  password: z.string().min(8).max(200),
  specialties: specialtiesSchema,
  bio: z.string().trim().max(1000).optional().default(""),
});

export type InviteStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface InviteState {
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Single source of truth for invite status, shared by the admin list and the
 * redemption endpoints. Precedence matters: a revoked invite stays revoked
 * even after its expiry passes, and an accepted invite is never re-openable.
 */
export function inviteStatus(invite: InviteState, now = new Date()): InviteStatus {
  if (invite.acceptedAt) return "ACCEPTED";
  if (invite.revokedAt) return "REVOKED";
  if (invite.expiresAt <= now) return "EXPIRED";
  return "PENDING";
}

export function isRedeemable(invite: InviteState, now = new Date()): boolean {
  return inviteStatus(invite, now) === "PENDING";
}

export function inviteUrl(token: string): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base}/invite/${token}`;
}
