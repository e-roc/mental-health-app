// Demo provider credentials surfaced on /provider/login to ease testing/demoing.
//
// TEMPORARY — remove this file, its test, and <ProviderTestCredentials> before
// any real deployment. Keep in sync with README.md ("Seeded demo accounts") and
// prisma/seed.ts; these must match the seeded rows or the login panel lies.

export const DEMO_PASSWORD = "demo-password-123";

export type DemoProviderAccount = {
  name: string;
  email: string;
  focus: string;
};

export const PROVIDER_DEMO_ACCOUNTS: DemoProviderAccount[] = [
  { name: "Dr. Ava Chen", email: "ava.chen@demo.local", focus: "anxiety, stress, sleep" },
  { name: "Dr. Sam Rivera", email: "sam.rivera@demo.local", focus: "depression, grief, relationships" },
  { name: "Dr. Maya Okafor", email: "maya.okafor@demo.local", focus: "trauma, substance-use, stress" },
];
