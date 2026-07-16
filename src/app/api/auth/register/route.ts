import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { blindIndex, encrypt, hashPassword } from "@/lib/crypto";
import { createSession, setSessionCookie } from "@/lib/auth";
import { rateLimitOr429 } from "@/lib/ratelimit";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const limited = rateLimitOr429(req, "register", { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const { name, email, password } = parsed.data;

  const emailHash = blindIndex(email);
  const existing = await prisma.user.findUnique({ where: { emailHash } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const user = await prisma.user.create({
    data: {
      role: "USER",
      emailHash,
      emailEnc: encrypt(email),
      nameEnc: encrypt(name),
      passwordHash: await hashPassword(password),
    },
  });

  await setSessionCookie(await createSession(user.id));
  return NextResponse.json({ ok: true, role: user.role });
}
