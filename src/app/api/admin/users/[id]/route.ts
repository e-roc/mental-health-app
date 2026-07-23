import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";

/**
 * Delete a patient (USER) account. Their questionnaires, chat sessions, and
 * messages cascade-delete via the schema's onDelete: Cascade relations.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireRole("ADMIN");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account" },
      { status: 409 }
    );
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role !== "USER") {
    return NextResponse.json(
      { error: "Only patient accounts can be deleted here" },
      { status: 409 }
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
