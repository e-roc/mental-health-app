import { PrismaClient } from "@prisma/client";
import { blindIndex, encrypt, hashPassword } from "../src/lib/crypto";

const prisma = new PrismaClient();

const AI_PROVIDERS = [
  {
    name: "Dr. Ava Chen (AI Test)",
    email: "ava.chen@demo.local",
    specialties: ["anxiety", "stress", "sleep"],
    bio: "Cognitive behavioral therapy focus. AI test provider for demo purposes.",
  },
  {
    name: "Dr. Sam Rivera (AI Test)",
    email: "sam.rivera@demo.local",
    specialties: ["depression", "grief", "relationships"],
    bio: "Person-centered therapy focus. AI test provider for demo purposes.",
  },
  {
    name: "Dr. Maya Okafor (AI Test)",
    email: "maya.okafor@demo.local",
    specialties: ["trauma", "substance-use", "stress"],
    bio: "Trauma-informed care focus. AI test provider for demo purposes.",
  },
];

// Demo-only credentials; documented in the README. Rotate for anything real.
const DEMO_PASSWORD = "demo-password-123";

async function upsertAccount(opts: {
  name: string;
  email: string;
  role: "USER" | "PROVIDER" | "ADMIN";
}) {
  const emailHash = blindIndex(opts.email);
  const existing = await prisma.user.findUnique({ where: { emailHash } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      role: opts.role,
      emailHash,
      emailEnc: encrypt(opts.email),
      nameEnc: encrypt(opts.name),
      passwordHash: await hashPassword(DEMO_PASSWORD),
    },
  });
}

async function main() {
  const admin = await upsertAccount({
    name: "Admin",
    email: "admin@demo.local",
    role: "ADMIN",
  });
  console.log(`Admin ready: admin@demo.local (${admin.id})`);

  for (const p of AI_PROVIDERS) {
    const user = await upsertAccount({
      name: p.name,
      email: p.email,
      role: "PROVIDER",
    });
    await prisma.providerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        specialties: p.specialties,
        bio: p.bio,
        isAvailable: true,
        useSchedule: false,
        isAI: true,
      },
      update: {},
    });
    console.log(`AI provider ready: ${p.email}`);
  }

  await prisma.setting.upsert({
    where: { key: "connectWindowMinutes" },
    create: { key: "connectWindowMinutes", value: "5" },
    update: {},
  });
  console.log("Settings ready: connectWindowMinutes=5");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
