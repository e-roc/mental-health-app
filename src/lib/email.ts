/** Canonical form for email equality: trim + lowercase. Apply before blindIndex. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
