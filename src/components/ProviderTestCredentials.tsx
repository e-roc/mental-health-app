"use client";

import type { CredentialFill } from "@/components/AuthForm";
import { DEMO_PASSWORD, PROVIDER_DEMO_ACCOUNTS } from "@/lib/demoProviders";

/**
 * TEMPORARY demo aid on /provider/login: lists the seeded test provider account
 * and its password so the flow can be demoed without a real credential. Only the
 * first account is seeded (see prisma/seed.ts), so only it is shown. Clicking the
 * email prefills the login form. Remove this (and its data source) before any
 * real deployment.
 */
export function ProviderTestCredentials({
  onSelect,
}: {
  /** Fills the login form with the clicked account's credentials. */
  onSelect?: CredentialFill;
}) {
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-dashed border-clay/40 bg-clay-mist/40 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-clay">
        Demo only — remove before launch
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Test provider account. Password{" "}
        <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
          {DEMO_PASSWORD}
        </code>
        . Click the email to fill the form.
      </p>
      <ul className="mt-3 space-y-2">
        {PROVIDER_DEMO_ACCOUNTS.slice(0, 1).map((account) => (
          <li key={account.email} className="text-sm">
            <button
              type="button"
              onClick={() =>
                onSelect?.({ email: account.email, password: DEMO_PASSWORD })
              }
              className="rounded font-mono text-xs text-fern-deep underline decoration-fern/40 underline-offset-4 transition-colors duration-300 hover:decoration-fern"
            >
              {account.email}
            </button>
            <span className="block text-xs text-ink-faint">
              {account.name} — {account.focus}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
