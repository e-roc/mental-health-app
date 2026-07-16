import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { hashToken, randomToken } from "@/lib/crypto";
import type { User } from "@prisma/client";

import { SESSION_COOKIE } from "@/lib/constants";

export { SESSION_COOKIE };
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type Role = "USER" | "PROVIDER" | "ADMIN";

export async function createSession(userId: string): Promise<string> {
  const token = randomToken();
  await prisma.authSession.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.authSession
      .deleteMany({ where: { tokenHash: hashToken(token) } })
      .catch(() => {});
  }
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

/** Returns the user if authenticated with one of the given roles, else null. */
export async function requireRole(...roles: Role[]): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user || !roles.includes(user.role as Role)) return null;
  return user;
}
