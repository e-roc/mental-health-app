import { DEMO_PASSWORD, PROVIDER_DEMO_ACCOUNTS } from "@/lib/demoProviders";

/**
 * TEMPORARY demo aid on /provider/login: lists the seeded test provider accounts
 * and their shared password so the flow can be demoed without a real credential.
 * Remove this (and its data source) before any real deployment.
 */
export function ProviderTestCredentials() {
  return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-dashed border-clay/40 bg-clay-mist/40 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-clay">
        Demo only — remove before launch
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Test provider accounts. Shared password{" "}
        <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
          {DEMO_PASSWORD}
        </code>
        .
      </p>
      <ul className="mt-3 space-y-2">
        {PROVIDER_DEMO_ACCOUNTS.map((account) => (
          <li key={account.email} className="text-sm">
            <code className="font-mono text-xs text-ink">{account.email}</code>
            <span className="block text-xs text-ink-faint">
              {account.name} — {account.focus}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
