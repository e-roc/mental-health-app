import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { blindIndex, verifyPassword } from "@/lib/crypto";
import { createSession, setSessionCookie } from "@/lib/auth";
import { rateLimitOr429 } from "@/lib/ratelimit";
import { normalizeEmail } from "@/lib/email";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const limited = rateLimitOr429(req, "login", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { emailHash: blindIndex(normalizeEmail(email)) },
  });
  // Same error for unknown email vs wrong password (no account enumeration).
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }

  await setSessionCookie(await createSession(user.id));
  return NextResponse.json({ ok: true, role: user.role });
}
