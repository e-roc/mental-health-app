import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Cormorant_Garamond, Mulish } from "next/font/google";
import { getCurrentUser } from "@/lib/auth";
import { userName } from "@/lib/pii";
import { LogoutButton } from "@/components/LogoutButton";
import { CrisisBar } from "@/components/CrisisBar";
import { logoutRedirect } from "@/lib/logoutRedirect";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-cormorant",
});

const mulish = Mulish({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mulish",
});

export const metadata: Metadata = {
  title: "Haven — Mental Health Support",
  description: "Connect with a mental health provider",
};

// Lock the mobile viewport: fit device width, no auto/pinch zoom (stops iOS
// focus-zoom on inputs). viewportFit: cover pairs with the safe-area insets in
// globals.css so content clears the notch/home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${cormorant.variable} ${mulish.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-fern focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-edge/80 bg-mist/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <Link
              href="/"
              className="font-serif text-2xl font-semibold tracking-tight text-ink transition-colors duration-300 hover:text-fern-deep"
            >
              Haven
            </Link>
            <nav className="flex items-center gap-4 text-sm sm:gap-6">
              {user ? (
                <>
                  {user.role === "USER" && (
                    <Link
                      href="/questionnaire"
                      className="text-ink-soft transition-colors duration-300 hover:text-fern-deep"
                    >
                      Get support
                    </Link>
                  )}
                  {user.role === "PROVIDER" && (
                    <Link
                      href="/provider"
                      className="text-ink-soft transition-colors duration-300 hover:text-fern-deep"
                    >
                      Provider dashboard
                    </Link>
                  )}
                  {user.role === "ADMIN" && (
                    <Link
                      href="/admin"
                      className="text-ink-soft transition-colors duration-300 hover:text-fern-deep"
                    >
                      Admin
                    </Link>
                  )}
                  <span className="hidden text-ink-faint sm:inline">
                    {userName(user)}
                  </span>
                  <LogoutButton redirectTo={logoutRedirect(user.role)} />
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-ink-soft transition-colors duration-300 hover:text-fern-deep"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-full bg-fern px-5 py-2 font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-fern-deep active:translate-y-0"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <CrisisBar isProvider={user?.role === "PROVIDER"} />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
          {children}
        </main>
        <footer className="border-t border-edge/80">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-8">
            <p>
              <span className="font-serif text-sm italic text-ink-soft">
                Haven
              </span>{" "}
              — private support, when you need it.
            </p>
            <p>
              In crisis? Call or text <strong className="text-clay">988</strong>{" "}
              (US) any time.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
