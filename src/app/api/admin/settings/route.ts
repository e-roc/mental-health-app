import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import {
  getConnectWindowMinutes,
  setConnectWindowMinutes,
} from "@/lib/settings";

const schema = z.object({
  connectWindowMinutes: z.number().int().min(1).max(1440),
});

export async function POST(req: Request) {
  const admin = await requireRole("ADMIN");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "connectWindowMinutes must be an integer between 1 and 1440" },
      { status: 400 }
    );
  }
  await setConnectWindowMinutes(parsed.data.connectWindowMinutes);
  return NextResponse.json({
    connectWindowMinutes: await getConnectWindowMinutes(),
  });
}
