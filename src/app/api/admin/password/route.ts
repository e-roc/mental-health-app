import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { hashPassword, verifyPassword, hashToken } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/constants";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

/** Change the signed-in admin's own password; revoke their other sessions. */
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
  const { currentPassword, newPassword } = parsed.data;

  if (!(await verifyPassword(currentPassword, admin.passwordHash))) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 401 }
    );
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Invalidate every other session for this admin; keep the current one alive.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.authSession.deleteMany({
      where: { userId: admin.id, NOT: { tokenHash: hashToken(token) } },
    });
  }

  return NextResponse.json({ ok: true });
}
