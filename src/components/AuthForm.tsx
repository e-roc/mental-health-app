"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { btnPrimary, errorText, field, fieldLabel } from "@/lib/ui";

/** Prefills the email + password fields (e.g. from a demo-account picker). */
export type CredentialFill = (creds: { email: string; password: string }) => void;

export function AuthForm({
  mode,
  title,
  subtitle,
  showRegisterLink = true,
  renderExtras,
}: {
  mode: "login" | "register";
  /** Overrides the default heading (e.g. for a provider-branded login). */
  title?: string;
  /** Overrides the default sub-heading copy. */
  subtitle?: string;
  /** Hide the "No account? Sign up" link (providers are invite-only). */
  showRegisterLink?: boolean;
  /**
   * Extra content rendered below the form, given a callback that fills the
   * email + password fields. Used by the provider demo-account picker.
   */
  renderExtras?: (fill: CredentialFill) => ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, string> = { email, password };
    if (mode === "register") payload.name = String(form.get("name") ?? "");

    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    if (data.role === "PROVIDER") router.push("/provider");
    else if (data.role === "ADMIN") router.push("/admin");
    else router.push("/questionnaire");
    router.refresh();
  }

  return (
    <div className="rise mx-auto max-w-sm pt-8">
      <h1 className="font-serif text-4xl font-medium tracking-tight text-ink">
        {title ?? (mode === "login" ? "Welcome back" : "Create your account")}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {subtitle ??
          (mode === "login"
            ? "Pick up where you left off."
            : "A few details, then you can reach a provider in minutes.")}
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        {mode === "register" && (
          <label className="block">
            <span className={fieldLabel}>Name</span>
            <input name="name" required maxLength={100} className={field} />
          </label>
        )}
        <label className="block">
          <span className={fieldLabel}>Email</span>
          <input
            name="email"
            type="email"
            required
            className={field}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={fieldLabel}>
            Password{mode === "register" && " (at least 8 characters)"}
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={mode === "register" ? 8 : 1}
            className={field}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className={errorText}>{error}</p>}
        <button disabled={busy} className={`${btnPrimary} w-full py-3`}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
      </form>
      {renderExtras?.(({ email: e, password: p }) => {
        setEmail(e);
        setPassword(p);
      })}
      {!(mode === "login" && !showRegisterLink) && (
      <p className="mt-6 text-sm text-ink-soft">
        {mode === "login" ? (
          <>
            No account?{" "}
            <Link
              href="/register"
              className="font-semibold text-fern-deep underline decoration-fern/40 underline-offset-4 transition-colors duration-300 hover:decoration-fern"
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold text-fern-deep underline decoration-fern/40 underline-offset-4 transition-colors duration-300 hover:decoration-fern"
            >
              Log in
            </Link>
          </>
        )}
      </p>
      )}
    </div>
  );
}
