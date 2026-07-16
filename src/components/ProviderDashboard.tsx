"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRealtime } from "@/lib/useRealtime";
import {
  btnPrimary,
  btnSecondary,
  card,
  errorText,
  pill,
  sectionTitle,
} from "@/lib/ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Block {
  dayOfWeek: number;
  startMin: number;
  endMin: number;
}

interface DashboardData {
  profile: {
    isAvailable: boolean;
    useSchedule: boolean;
    specialties: string[];
    bio: string;
  };
  schedule: Block[];
  sessions: {
    id: string;
    status: string;
    matchType: string;
    connectBy: string;
    createdAt: string;
  }[];
}

function minToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const POLL_MS = 30_000;

const timeField =
  "rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-sm text-ink transition-colors duration-300 focus:border-fern focus:outline-none focus:ring-2 focus:ring-fern/25";

export function ProviderDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scheduleDirty, setScheduleDirty] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/provider/dashboard", { cache: "no-store" });
    if (!res.ok) {
      setError("Unable to load dashboard");
      return;
    }
    const d: DashboardData = await res.json();
    setData(d);
    setBlocks((prev) => (scheduleDirty ? prev : d.schedule));
  }, [scheduleDirty]);

  // Incoming pings arrive over WebSocket push; slow poll is a safety net.
  useRealtime(["provider:self"], load, POLL_MS);

  async function setAvailability(payload: { isAvailable?: boolean; useSchedule?: boolean }) {
    setError(null);
    const res = await fetch("/api/provider/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) setError("Failed to update availability");
    load();
  }

  async function saveSchedule() {
    setError(null);
    const res = await fetch("/api/provider/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Failed to save schedule");
      return;
    }
    setScheduleDirty(false);
    load();
  }

  if (!data) return <p className="pt-12 text-center text-ink-faint">Loading…</p>;

  const pending = data.sessions.filter((s) => s.status === "PENDING");
  const active = data.sessions.filter((s) => s.status === "ACTIVE");

  return (
    <div className="space-y-8">
      <h1 className="rise font-serif text-4xl font-medium tracking-tight text-ink">
        Provider dashboard
      </h1>
      {error && <p className={errorText}>{error}</p>}

      {pending.length > 0 && (
        <section className="rise rounded-2xl border-2 border-fern/60 bg-fern-mist p-6 shadow-[0_20px_45px_-32px_rgba(61,99,85,0.5)]">
          <h2 className="font-serif text-2xl font-semibold text-fern-deep">
            Incoming chat request{pending.length > 1 ? "s" : ""}
          </h2>
          <ul className="mt-4 space-y-3">
            {pending.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4">
                <span className="text-sm text-fern-deep">
                  Requested {new Date(s.createdAt).toLocaleTimeString()} — join
                  before {new Date(s.connectBy).toLocaleTimeString()}
                </span>
                <Link href={`/chat/${s.id}`} className={btnPrimary}>
                  Open request
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={`rise rise-2 ${card}`}>
        <h2 className={sectionTitle}>Availability</h2>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span
            className={`${pill} py-1 ${
              data.profile.isAvailable
                ? "bg-moss-mist text-moss"
                : "bg-mist text-ink-faint"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                data.profile.isAvailable ? "bg-moss" : "bg-ink-faint"
              }`}
            />
            {data.profile.isAvailable ? "Available" : "Unavailable"}
          </span>
          {data.profile.useSchedule ? (
            <span className="text-sm text-ink-faint">
              Controlled by your schedule below
            </span>
          ) : (
            <button
              onClick={() => setAvailability({ isAvailable: !data.profile.isAvailable })}
              className={btnSecondary}
            >
              {data.profile.isAvailable ? "Go unavailable" : "Go available"}
            </button>
          )}
          <label className="ml-auto flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={data.profile.useSchedule}
              onChange={(e) => setAvailability({ useSchedule: e.target.checked })}
              className="size-4 accent-fern"
            />
            Auto-switch from schedule
          </label>
        </div>
      </section>

      <section className={`rise rise-3 ${card}`}>
        <h2 className={sectionTitle}>Weekly schedule</h2>
        <p className="mt-2 text-sm text-ink-faint">
          When &quot;auto-switch&quot; is on, your availability flag follows these
          hours automatically.
        </p>
        <ul className="mt-5 space-y-2.5">
          {blocks.map((b, i) => (
            <li key={i} className="flex items-center gap-3 text-sm">
              <select
                value={b.dayOfWeek}
                onChange={(e) => {
                  const next = [...blocks];
                  next[i] = { ...b, dayOfWeek: Number(e.target.value) };
                  setBlocks(next);
                  setScheduleDirty(true);
                }}
                className={timeField}
              >
                {DAYS.map((d, di) => (
                  <option key={d} value={di}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={minToTime(b.startMin)}
                onChange={(e) => {
                  const next = [...blocks];
                  next[i] = { ...b, startMin: timeToMin(e.target.value) };
                  setBlocks(next);
                  setScheduleDirty(true);
                }}
                className={timeField}
              />
              <span className="text-ink-faint">to</span>
              <input
                type="time"
                value={minToTime(b.endMin)}
                onChange={(e) => {
                  const next = [...blocks];
                  next[i] = { ...b, endMin: timeToMin(e.target.value) };
                  setBlocks(next);
                  setScheduleDirty(true);
                }}
                className={timeField}
              />
              <button
                onClick={() => {
                  setBlocks(blocks.filter((_, bi) => bi !== i));
                  setScheduleDirty(true);
                }}
                className="text-ink-faint transition-colors duration-300 hover:text-rose"
                aria-label="Remove block"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => {
              setBlocks([...blocks, { dayOfWeek: 1, startMin: 9 * 60, endMin: 17 * 60 }]);
              setScheduleDirty(true);
            }}
            className={btnSecondary}
          >
            + Add hours
          </button>
          {scheduleDirty && (
            <button onClick={saveSchedule} className={btnPrimary}>
              Save schedule
            </button>
          )}
        </div>
      </section>

      <section className={`rise rise-4 ${card}`}>
        <h2 className={sectionTitle}>Active sessions</h2>
        {active.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">
            No active sessions — when someone is matched with you, their chat
            will appear here.
          </p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {active.map((s) => (
              <li key={s.id} className="flex items-center justify-between text-sm text-ink-soft">
                <span>Started {new Date(s.createdAt).toLocaleTimeString()}</span>
                <Link
                  href={`/chat/${s.id}`}
                  className="font-semibold text-fern-deep underline decoration-fern/40 underline-offset-4 transition-colors duration-300 hover:decoration-fern"
                >
                  Open chat
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`rise rise-4 ${card}`}>
        <h2 className={sectionTitle}>Your focus areas</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.profile.specialties.map((s) => (
            <span key={s} className={`${pill} bg-fern-mist py-1 text-fern-deep`}>
              {s}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
