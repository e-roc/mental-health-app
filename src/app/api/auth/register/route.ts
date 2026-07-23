import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { blindIndex, encrypt, hashPassword } from "@/lib/crypto";
import { createSession, setSessionCookie } from "@/lib/auth";
import { rateLimitOr429 } from "@/lib/ratelimit";
import { normalizeEmail } from "@/lib/email";

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
  const { name, password } = parsed.data;
  const email = normalizeEmail(parsed.data.email);
  const emailHash = blindIndex(email);

  // Invite-only: the email must be pre-approved by an admin.
  const allowed = await prisma.allowedEmail.findUnique({ where: { emailHash } });
  if (!allowed) {
    return NextResponse.json(
      { error: "Registration is invite-only." },
      { status: 403 }
    );
  }

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
