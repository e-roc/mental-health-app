"use client";

import { useState } from "react";
import {
  btnPrimary,
  btnSecondary,
  card,
  errorText,
  field,
  fieldLabel,
  pill,
  sectionTitle,
} from "@/lib/ui";

export interface InviteRow {
  id: string;
  name: string;
  email: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
}

const INVITE_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-clay-mist text-clay",
  ACCEPTED: "bg-moss-mist text-moss",
  REVOKED: "bg-mist text-ink-faint",
  EXPIRED: "bg-mist text-ink-faint",
};

const th = "py-2.5 pr-4 text-xs font-semibold uppercase tracking-wider text-ink-faint";

export function ProviderInvites({
  invites,
  onChange,
}: {
  invites: InviteRow[];
  onChange: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The raw link exists only in this response — surface it until dismissed,
  // because it is never retrievable again.
  const [newLink, setNewLink] = useState<{ email: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function createInvite(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "");
    const res = await fetch("/api/admin/providers/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: String(fd.get("name") ?? ""), email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create invite");
      return;
    }
    setNewLink({ email, url: data.inviteUrl });
    setCopied(false);
    form.reset();
    onChange();
  }

  async function revoke(id: string) {
    setError(null);
    const res = await fetch(`/api/admin/providers/invite/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to revoke invite");
      return;
    }
    onChange();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={card}>
      <h2 className={sectionTitle}>Invite a provider</h2>
      <p className="mt-2 text-sm text-ink-faint">
        The provider sets their own password and focus areas from the link.
        Invites expire after 7 days.
      </p>

      <form onSubmit={createInvite} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className={fieldLabel}>Name</span>
          <input
            name="name"
            required
            maxLength={100}
            placeholder="Dr. Jordan Lee"
            className={`${field} w-48`}
          />
        </label>
        <label className="block text-sm">
          <span className={fieldLabel}>Email</span>
          <input
            name="email"
            type="email"
            required
            placeholder="jordan.lee@example.com"
            className={`${field} w-64`}
          />
        </label>
        <button disabled={busy} className={btnPrimary}>
          {busy ? "Creating…" : "Create invite link"}
        </button>
      </form>

      {error && <p className={`mt-3 ${errorText}`}>{error}</p>}

      {newLink && (
        <div className="mt-5 rounded-2xl border-2 border-fern/60 bg-fern-mist p-5">
          <p className="text-sm font-semibold text-fern-deep">
            Invite link for {newLink.email} — copy it now, it won&apos;t be
            shown again.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              readOnly
              value={newLink.url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 rounded-xl border border-fern/30 bg-surface px-3.5 py-2.5 font-mono text-xs text-ink"
            />
            <button onClick={() => copy(newLink.url)} className={btnPrimary}>
              {copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => setNewLink(null)} className={btnSecondary}>
              Done
            </button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left text-sm text-ink-soft">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Email</th>
                <th className={th}>Status</th>
                <th className={th}>Expires</th>
                <th className="py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id} className="border-t border-edge/60">
                  <td className="py-2.5 pr-4 text-ink">{i.name}</td>
                  <td className="py-2.5 pr-4">{i.email}</td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`${pill} ${INVITE_STATUS_STYLES[i.status] ?? ""}`}
                    >
                      {i.status}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-xs tabular-nums text-ink-faint">
                    {new Date(i.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 text-right">
                    {i.status === "PENDING" && (
                      <button
                        onClick={() => revoke(i.id)}
                        className="text-xs text-ink-faint transition-colors duration-300 hover:text-rose"
                      >
                        Revoke
                      </button>
                    )}
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
