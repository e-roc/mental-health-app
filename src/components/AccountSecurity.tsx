"use client";

import { useState } from "react";
import { btnPrimary, card, errorText, field, fieldLabel, sectionTitle } from "@/lib/ui";

export function AccountSecurity() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(false);
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await fetch("/api/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: String(fd.get("currentPassword") ?? ""),
        newPassword: String(fd.get("newPassword") ?? ""),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to change password");
      return;
    }
    form.reset();
    setOk(true);
  }

  return (
    <section className={card}>
      <h2 className={sectionTitle}>Change password</h2>
      <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className={fieldLabel}>Current password</span>
          <input name="currentPassword" type="password" required className={`${field} w-56`} />
        </label>
        <label className="block text-sm">
          <span className={fieldLabel}>New password</span>
          <input
            name="newPassword"
            type="password"
            required
            minLength={8}
            className={`${field} w-56`}
          />
        </label>
        <button disabled={busy} className={btnPrimary}>
          {busy ? "Saving…" : "Update password"}
        </button>
        {ok && <span className="pb-2.5 text-sm text-moss">Password updated</span>}
      </form>
      {error && <p className={`mt-3 ${errorText}`}>{error}</p>}
    </section>
  );
}
