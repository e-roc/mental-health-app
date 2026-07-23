import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { blindIndex, encrypt } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/email";

const schema = z.object({ email: z.string().trim().email().max(254) });

/** Add an email to the registration allowlist. */
export async function POST(req: Request) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const email = normalizeEmail(parsed.data.email);
  const emailHash = blindIndex(email);

  const existing = await prisma.allowedEmail.findUnique({ where: { emailHash } });
  if (existing) {
    return NextResponse.json(
      { error: "That email is already on the allowlist" },
      { status: 409 }
    );
  }

  const created = await prisma.allowedEmail.create({
    data: { emailHash, emailEnc: encrypt(email), addedById: admin.id },
  });
  return NextResponse.json({ id: created.id, email, createdAt: created.createdAt });
}
