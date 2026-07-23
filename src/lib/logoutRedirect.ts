// Where to send someone after they log out. Providers return to their dedicated
// login entry; everyone else lands on the public home page. Pure so it can be
// unit-tested and shared by the client LogoutButton.
export function logoutRedirect(role: string | null | undefined): string {
  return role === "PROVIDER" ? "/provider/login" : "/";
}
