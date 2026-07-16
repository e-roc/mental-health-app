"use client";

import { useCallback, useState } from "react";
import { useRealtime } from "@/lib/useRealtime";
import { ProviderInvites, type InviteRow } from "@/components/ProviderInvites";
import {
  btnPrimary,
  card,
  errorText,
  field,
  fieldLabel,
  pill,
  sectionTitle,
} from "@/lib/ui";

interface Overview {
  settings: { connectWindowMinutes: number };
  invites: InviteRow[];
  users: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    lastRiskLevel: string | null;
  }[];
  providers: {
    id: string;
    name: string;
    email: string;
    specialties: string[];
    isAvailable: boolean;
    useSchedule: boolean;
    isAI: boolean;
    activeSessions: number;
  }[];
  sessions: {
    id: string;
    userName: string;
    providerName: string;
    status: string;
    matchType: string;
    createdAt: string;
  }[];
}

const POLL_MS = 30_000;

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-clay-mist text-clay",
  ACTIVE: "bg-moss-mist text-moss",
  EXPIRED: "bg-mist text-ink-faint",
  CLOSED: "bg-mist text-ink-faint",
};

const th = "py-2.5 pr-4 text-xs font-semibold uppercase tracking-wider text-ink-faint";
const td = "py-2.5 pr-4";

export function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [windowMin, setWindowMin] = useState<string>("");
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/overview", { cache: "no-store" });
    if (!res.ok) {
      setError("Unable to load admin data");
      return;
    }
    const d: Overview = await res.json();
    setData(d);
    setWindowMin((prev) => prev || String(d.settings.connectWindowMinutes));
  }, []);

  useRealtime(["admin"], load, POLL_MS);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSavedMsg(null);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectWindowMinutes: Number(windowMin) }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error ?? "Failed to save");
      return;
    }
    setSavedMsg("Saved");
    load();
  }

  async function overrideAvailability(
    providerId: string,
    payload: { isAvailable?: boolean; useSchedule?: boolean }
  ) {
    setError(null);
    const res = await fetch(`/api/admin/providers/${providerId}/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to override availability");
    }
    load();
  }

  if (!data) return <p className="pt-12 text-center text-ink-faint">Loading…</p>;

  const activeSessions = data.sessions.filter(
    (s) => s.status === "ACTIVE" || s.status === "PENDING"
  );

  return (
    <div className="space-y-8">
      <h1 className="rise font-serif text-4xl font-medium tracking-tight text-ink">
        Admin
      </h1>
      {error && <p className={errorText}>{error}</p>}

      <section className={`rise rise-2 ${card}`}>
        <h2 className={sectionTitle}>Settings</h2>
        <form onSubmit={saveSettings} className="mt-4 flex items-end gap-3">
          <label className="block text-sm">
            <span className={fieldLabel}>
              Provider connect window (minutes)
            </span>
            <input
              type="number"
              min={1}
              max={1440}
              value={windowMin}
              onChange={(e) => setWindowMin(e.target.value)}
              className={`${field} w-32 tabular-nums`}
            />
          </label>
          <button className={btnPrimary}>Save</button>
          {savedMsg && <span className="pb-2.5 text-sm text-moss">{savedMsg}</span>}
        </form>
      </section>

      <section className={`rise rise-3 ${card}`}>
        <h2 className={sectionTitle}>
          Sessions{" "}
          <span className="text-lg text-ink-faint">
            ({activeSessions.length} live)
          </span>
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-ink-soft">
            <thead>
              <tr>
                <th className={th}>User</th>
                <th className={th}>Provider</th>
                <th className={th}>Status</th>
                <th className={th}>Match</th>
                <th className={`${th} pr-0`}>Started</th>
              </tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.id} className="border-t border-edge/60">
                  <td className={`${td} text-ink`}>{s.userName}</td>
                  <td className={td}>{s.providerName}</td>
                  <td className={td}>
                    <span className={`${pill} ${STATUS_STYLES[s.status] ?? ""}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className={`${td} text-xs text-ink-faint`}>
                    {s.matchType === "MATCHED" ? "Matched" : "Random fallback"}
                  </td>
                  <td className="py-2.5 text-xs tabular-nums text-ink-faint">
                    {new Date(s.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {data.sessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-ink-faint">
                    No sessions yet — they&apos;ll appear here as people are
                    matched.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="rise rise-4">
        <ProviderInvites invites={data.invites} onChange={load} />
      </div>

      <section className={`rise rise-4 ${card}`}>
        <h2 className={sectionTitle}>
          Providers{" "}
          <span className="text-lg text-ink-faint">({data.providers.length})</span>
        </h2>
        <p className="mt-2 text-sm text-ink-faint">
          Forcing availability takes a provider out of schedule mode, so their
          hours won&apos;t silently undo your override.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-ink-soft">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Email</th>
                <th className={th}>Specialties</th>
                <th className={th}>Available</th>
                <th className={th}>Mode</th>
                <th className={th}>Active</th>
                <th className={`${th} pr-0`}>Override</th>
              </tr>
            </thead>
            <tbody>
              {data.providers.map((p) => (
                <tr key={p.id} className="border-t border-edge/60">
                  <td className={`${td} text-ink`}>
                    {p.name}
                    {p.isAI && (
                      <span className={`${pill} ml-2 bg-clay-mist text-clay`}>
                        AI test
                      </span>
                    )}
                  </td>
                  <td className={td}>{p.email}</td>
                  <td className={`${td} text-xs text-ink-faint`}>
                    {p.specialties.join(", ")}
                  </td>
                  <td className={td}>
                    <span
                      className={`${pill} ${
                        p.isAvailable
                          ? "bg-moss-mist text-moss"
                          : "bg-mist text-ink-faint"
                      }`}
                    >
                      {p.isAvailable ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className={`${td} text-xs text-ink-faint`}>
                    {p.useSchedule ? "Scheduled" : "Manual"}
                  </td>
                  <td className={`${td} tabular-nums`}>{p.activeSessions}</td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          overrideAvailability(p.id, { isAvailable: !p.isAvailable })
                        }
                        className="rounded-full border border-edge px-3 py-1 text-xs text-ink-soft transition-colors duration-300 hover:border-fern hover:text-fern-deep"
                      >
                        Force {p.isAvailable ? "off" : "on"}
                      </button>
                      {!p.useSchedule && (
                        <button
                          onClick={() =>
                            overrideAvailability(p.id, { useSchedule: true })
                          }
                          className="text-xs text-ink-faint transition-colors duration-300 hover:text-fern-deep"
                        >
                          Use schedule
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`rise rise-4 ${card}`}>
        <h2 className={sectionTitle}>
          Users <span className="text-lg text-ink-faint">({data.users.length})</span>
        </h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-ink-soft">
            <thead>
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Email</th>
                <th className={th}>Last risk level</th>
                <th className={`${th} pr-0`}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-t border-edge/60">
                  <td className={`${td} text-ink`}>{u.name}</td>
                  <td className={td}>{u.email}</td>
                  <td className={td}>
                    {u.lastRiskLevel ? (
                      <span
                        className={`${pill} ${
                          u.lastRiskLevel === "HIGH"
                            ? "bg-rose-mist text-rose"
                            : u.lastRiskLevel === "MODERATE"
                              ? "bg-clay-mist text-clay"
                              : "bg-moss-mist text-moss"
                        }`}
                      >
                        {u.lastRiskLevel}
                      </span>
                    ) : (
                      <span className="text-xs text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-xs tabular-nums text-ink-faint">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-ink-faint">
                    No users yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
