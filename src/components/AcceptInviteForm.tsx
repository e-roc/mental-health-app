"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CONCERN_TAGS } from "@/lib/questionnaire";
import { btnPrimary, btnSecondary, errorText, field, fieldLabel } from "@/lib/ui";

const SPECIALTY_LABELS: Record<string, string> = {
  anxiety: "Anxiety",
  depression: "Depression",
  stress: "Stress & burnout",
  sleep: "Sleep",
  relationships: "Relationships",
  grief: "Grief & loss",
  trauma: "Trauma",
  "substance-use": "Substance use",
};

interface InviteInfo {
  name: string;
  email: string;
  expiresAt: string;
}

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [specialties, setSpecialties] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/invite/${token}`, { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(data.error ?? "This invite link is not valid");
      return;
    }
    setInvite(data);
  }, [token]);

  useEffect(() => {
    const kick = setTimeout(load, 0);
    return () => clearTimeout(kick);
  }, [load]);

  function toggleSpecialty(tag: string) {
    setSpecialties((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (specialties.length === 0) {
      setError("Select at least one focus area");
      return;
    }
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) {
      setError("Passwords don't match");
      return;
    }

    setBusy(true);
    const res = await fetch(`/api/invite/${token}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password,
        specialties,
        bio: String(form.get("bio") ?? ""),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    router.push("/provider");
    router.refresh();
  }

  if (loadError) {
    return (
      <div className="rise mx-auto max-w-md pt-12 text-center">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-ink">
          Invite unavailable
        </h1>
        <p className="mt-4 leading-relaxed text-ink-soft">{loadError}</p>
        <Link href="/login" className={`${btnSecondary} mt-8`}>
          Go to login
        </Link>
      </div>
    );
  }
  if (!invite) return <p className="pt-12 text-center text-ink-faint">Loading…</p>;

  return (
    <div className="rise mx-auto max-w-md pt-8">
      <h1 className="font-serif text-4xl font-medium tracking-tight text-ink">
        Welcome, {invite.name}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        You&apos;ve been invited to join Haven as a provider. Set a password and
        choose your focus areas — we use them to match you with the people best
        suited to your practice.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <label className="block">
          <span className={fieldLabel}>Email</span>
          <input value={invite.email} disabled className={field} />
        </label>

        <label className="block">
          <span className={fieldLabel}>Password (at least 8 characters)</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className={field}
          />
        </label>

        <label className="block">
          <span className={fieldLabel}>Confirm password</span>
          <input
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            className={field}
          />
        </label>

        <fieldset>
          <legend className={fieldLabel}>
            Your focus areas (select all that apply)
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {CONCERN_TAGS.map((tag) => (
              <label
                key={tag}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors duration-200 hover:bg-fern-mist/60 has-[:checked]:bg-fern-mist has-[:checked]:text-fern-deep"
              >
                <input
                  type="checkbox"
                  checked={specialties.includes(tag)}
                  onChange={() => toggleSpecialty(tag)}
                  className="size-4 accent-fern"
                />
                {SPECIALTY_LABELS[tag]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block">
          <span className={fieldLabel}>Short bio (optional)</span>
          <textarea
            name="bio"
            rows={3}
            maxLength={1000}
            placeholder="Your approach, credentials, anything clients should know."
            className={field}
          />
        </label>

        {error && <p className={errorText}>{error}</p>}
        <button disabled={busy} className={`${btnPrimary} w-full py-3`}>
          {busy ? "Creating your account…" : "Create provider account"}
        </button>
        <p className="text-xs leading-relaxed text-ink-faint">
          You&apos;ll start as unavailable — set your availability or schedule on
          your dashboard when you&apos;re ready to take chats.
        </p>
      </form>
    </div>
  );
}
