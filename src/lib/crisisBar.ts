// Visibility rule for the top crisis-support bar. Kept as a pure function so it
// can be unit-tested without a DOM and reused by the client CrisisBar component.
//
// The bar is for people who may be in crisis (users/visitors). It is hidden from
// providers, whose surfaces are clinical rather than crisis-facing:
//   - any page a logged-in PROVIDER sees, and
//   - the logged-out provider login page.

/** Path of the provider-only login entry; the crisis bar is hidden here. */
export const PROVIDER_LOGIN_PATH = "/provider/login";

export function shouldShowCrisisBar(
  role: string | null | undefined,
  pathname: string,
): boolean {
  if (role === "PROVIDER") return false;
  if (pathname === PROVIDER_LOGIN_PATH) return false;
  return true;
}
