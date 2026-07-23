import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/** Remove an email from the allowlist. Does not touch any existing User. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await prisma.allowedEmail.delete({ where: { id } });
  } catch (e) {
    if (!(e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2025")) {
      throw e;
    }
    // Row already gone (concurrent delete) — idempotent success.
  }
  return NextResponse.json({ ok: true });
}
