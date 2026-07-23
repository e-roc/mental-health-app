"use client";

import { useState } from "react";
import { btnPrimary, card, errorText, field, fieldLabel, sectionTitle } from "@/lib/ui";

export interface AllowedEmailRow {
  id: string;
  email: string;
  createdAt: string;
}

const th = "py-2.5 pr-4 text-xs font-semibold uppercase tracking-wider text-ink-faint";

export function AllowedEmails({
  emails,
  onChange,
}: {
  emails: AllowedEmailRow[];
  onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "");
    const res = await fetch("/api/admin/allowed-emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to add email");
      return;
    }
    form.reset();
    onChange();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/allowed-emails/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to remove email");
      return;
    }
    onChange();
  }

  return (
    <section className={card}>
      <h2 className={sectionTitle}>Registration allowlist</h2>
      <p className="mt-2 text-sm text-ink-faint">
        Only these emails can create an account. Removing an email here does not
        delete an account that already exists.
      </p>

      <form onSubmit={add} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className={fieldLabel}>Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="patient@example.com"
            className={`${field} w-64`}
          />
        </label>
        <button disabled={busy} className={btnPrimary}>
          {busy ? "Adding…" : "Add email"}
        </button>
      </form>

      {error && <p className={`mt-3 ${errorText}`}>{error}</p>}

      {emails.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm text-ink-soft">
            <thead>
              <tr>
                <th className={th}>Email</th>
                <th className={th}>Added</th>
                <th className="py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {emails.map((a) => (
                <tr key={a.id} className="border-t border-edge/60">
                  <td className="py-2.5 pr-4 text-ink">{a.email}</td>
                  <td className="py-2.5 pr-4 text-xs tabular-nums text-ink-faint">
                    {new Date(a.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => remove(a.id)}
                      className="text-xs text-ink-faint transition-colors duration-300 hover:text-rose"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
