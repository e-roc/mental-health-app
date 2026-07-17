"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePoll } from "@/lib/usePoll";
import { useRealtime, type RealtimeEvent } from "@/lib/useRealtime";
import { btnPrimary, btnSecondary, pill } from "@/lib/ui";

interface ChatMessage {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

interface SessionState {
  id: string;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "CLOSED";
  connectBy: string;
  counterpartName: string;
  viewerId: string;
  viewerRole: "user" | "provider";
  aiTakeover: boolean;
  closedBy: "me" | "them" | null;
  messages: ChatMessage[];
}

const POLL_MS = 15_000;
// How long a typing indicator stays up after the last ping — long enough to
// survive normal pauses between keystrokes, short enough to feel current.
const TYPING_EXPIRY_MS = 4_000;
// How often we're willing to tell the other side we're still typing.
const TYPING_SEND_INTERVAL_MS = 1_500;

function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="flex justify-start" aria-live="polite">
      <div
        aria-hidden
        className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-edge/60 bg-surface px-4 py-3"
      >
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-ink-faint" />
        <span className="typing-dot typing-dot-2 h-1.5 w-1.5 rounded-full bg-ink-faint" />
        <span className="typing-dot typing-dot-3 h-1.5 w-1.5 rounded-full bg-ink-faint" />
      </div>
      <span className="sr-only">{name} is typing…</span>
    </div>
  );
}

/* Breathing circle: the waiting indicator carries the same rhythm as the
   home page — an invitation to breathe with it, not a spinner. */
function BreathingIndicator() {
  return (
    <div aria-hidden className="relative mx-auto mb-8 h-24 w-24">
      <div className="breathe absolute inset-0 rounded-full bg-fern-mist" />
      <div className="breathe breathe-late absolute inset-3 rounded-full bg-fern/25" />
      <div className="absolute inset-8 rounded-full bg-fern/70" />
    </div>
  );
}

function endedNote(session: SessionState): string {
  if (session.closedBy === "me") return "You ended this conversation.";
  if (session.closedBy === "them") {
    return `${session.counterpartName} ended this conversation.`;
  }
  return "This conversation has ended.";
}

export function ChatRoom({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCount = useRef(0);
  const [now, setNow] = useState<number | null>(null);
  const tick = useCallback(() => setNow(Date.now()), []);
  usePoll(tick, 1000);

  const [counterpartTyping, setCounterpartTyping] = useState(false);
  const viewerIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`, { cache: "no-store" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Unable to load session");
      return;
    }
    const data = await res.json();
    if (data.rerouted) {
      router.replace(`/chat/${data.sessionId}`);
      return;
    }
    setSession(data);
  }, [sessionId, router]);

  const handleRealtimeEvent = useCallback((_channel: string, event: RealtimeEvent) => {
    if (event.type !== "typing" || event.senderId === viewerIdRef.current) return;
    setCounterpartTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setCounterpartTyping(false), TYPING_EXPIRY_MS);
  }, []);

  // WebSocket push with a slow safety poll if the socket is down.
  const { send: sendRealtime } = useRealtime(
    [`session:${sessionId}`],
    load,
    POLL_MS,
    handleRealtimeEvent
  );

  useEffect(() => {
    viewerIdRef.current = session?.viewerId ?? null;
  }, [session?.viewerId]);

  useEffect(() => {
    if (session && session.messages.length !== messageCount.current) {
      messageCount.current = session.messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setCounterpartTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }
  }, [session]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  function handleDraftChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDraft(e.target.value);
    const now = Date.now();
    if (now - lastTypingSentRef.current > TYPING_SEND_INTERVAL_MS) {
      lastTypingSentRef.current = now;
      sendRealtime(`session:${sessionId}`, { type: "typing" });
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    const res = await fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft }),
    });
    setBusy(false);
    if (res.ok) {
      setDraft("");
      load();
    }
  }

  async function accept() {
    setBusy(true);
    const res = await fetch(`/api/sessions/${sessionId}/accept`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Unable to accept");
    }
    load();
  }

  async function close() {
    await fetch(`/api/sessions/${sessionId}/close`, { method: "POST" });
    load();
  }

  if (error) {
    return (
      <div className="rise mx-auto max-w-lg pt-12 text-center">
        <p className="text-rose">{error}</p>
        <Link href="/" className={`${btnSecondary} mt-6`}>
          Back home
        </Link>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="pt-16 text-center">
        <BreathingIndicator />
        <p className="text-sm text-ink-faint">Loading your session…</p>
      </div>
    );
  }

  if (session.status === "PENDING") {
    const secondsLeft = Math.max(
      0,
      Math.round(
        (new Date(session.connectBy).getTime() - (now ?? new Date(session.connectBy).getTime())) / 1000
      )
    );
    const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
    return (
      <div className="rise mx-auto max-w-lg pt-12 text-center">
        <BreathingIndicator />
        {session.viewerRole === "user" ? (
          <>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ink">
              A clinician is on their way
            </h1>
            <p className="mt-4 leading-relaxed text-ink-soft">
              We&apos;ve notified your provider. If they can&apos;t join in
              time, we&apos;ll automatically find you someone else.
            </p>
            <p className="mt-5 text-sm text-ink-faint">
              Waiting for provider ({clock} left) — take a slow breath with the
              circle while you wait.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-serif text-3xl font-medium tracking-tight text-ink">
              New chat request from {session.counterpartName}
            </h1>
            <p className="mt-4 leading-relaxed text-ink-soft">
              Accept within {clock} or the request will be routed to another
              provider.
            </p>
            <button
              onClick={accept}
              disabled={busy}
              className={`${btnPrimary} mt-8 px-8 py-3`}
            >
              Accept and join chat
            </button>
          </>
        )}
      </div>
    );
  }

  if (session.status === "EXPIRED") {
    return (
      <div className="rise mx-auto max-w-lg pt-12 text-center">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-ink">
          {session.viewerRole === "user"
            ? "We couldn't connect you this time"
            : "This request expired"}
        </h1>
        <p className="mt-4 leading-relaxed text-ink-soft">
          {session.viewerRole === "user"
            ? "No providers were able to join. Please try again — availability changes throughout the day."
            : "The connect window passed before the session was accepted."}
        </p>
        {session.viewerRole === "user" && (
          <Link href="/questionnaire" className={`${btnPrimary} mt-8 px-8 py-3`}>
            Try again
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="rise mx-auto flex h-[70vh] max-w-2xl flex-col overflow-hidden rounded-3xl border border-edge/70 bg-surface shadow-[0_30px_70px_-40px_rgba(34,51,44,0.4)]">
      <div className="flex items-center justify-between border-b border-edge/70 px-5 py-4">
        <div>
          <p className="font-serif text-lg font-semibold text-ink">
            {session.counterpartName}
          </p>
          <p className="text-xs text-ink-faint">
            {session.status === "ACTIVE"
              ? "Secure chat — encrypted at rest"
              : "Chat ended"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session.aiTakeover && (
            <span className={`${pill} bg-fern-mist text-fern-deep`}>
              You&apos;re live — AI auto-reply is off
            </span>
          )}
          {session.status === "ACTIVE" && (
            <button
              onClick={close}
              className="rounded-full border border-edge px-4 py-1.5 text-sm text-ink-soft transition-colors duration-300 hover:border-rose/50 hover:text-rose"
            >
              End chat
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-mist/50 p-5">
        {session.messages.map((m) => (
          <div key={m.id} className={m.mine ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.mine
                  ? "max-w-[75%] rounded-2xl rounded-br-md bg-fern px-4 py-2.5 text-sm leading-relaxed text-white"
                  : "max-w-[75%] rounded-2xl rounded-bl-md border border-edge/60 bg-surface px-4 py-2.5 text-sm leading-relaxed text-ink"
              }
            >
              {m.body}
            </div>
          </div>
        ))}
        {counterpartTyping && <TypingIndicator name={session.counterpartName} />}
        <div ref={bottomRef} />
      </div>
      {session.status === "ACTIVE" ? (
        <form onSubmit={send} className="flex gap-2 border-t border-edge/70 p-4">
          <input
            value={draft}
            onChange={handleDraftChange}
            maxLength={4000}
            placeholder="Type a message…"
            className="flex-1 rounded-full border border-edge bg-mist/60 px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors duration-300 focus:border-fern focus:bg-surface focus:outline-none focus:ring-2 focus:ring-fern/25"
          />
          <button
            disabled={busy || !draft.trim()}
            className={`${btnPrimary} px-5`}
          >
            Send
          </button>
        </form>
      ) : (
        <div className="border-t border-edge/70 p-4 text-center text-sm text-ink-faint">
          {endedNote(session)}
        </div>
      )}
    </div>
  );
}
