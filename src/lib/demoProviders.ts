// Demo provider credentials surfaced on /provider/login to ease testing/demoing.
//
// TEMPORARY — remove this file, its test, and <ProviderTestCredentials> before
// any real deployment. This is the full provider catalog; the seed and the login
// panel both take only the first entry (slice(0, 1)), so only that row is real.
// Keep the first entry in sync with README.md and prisma/seed.ts.

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
