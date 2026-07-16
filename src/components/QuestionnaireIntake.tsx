"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuestionnaireForm } from "@/components/QuestionnaireForm";
import { CONCERN_LABELS, type QuestionnaireAnswers } from "@/lib/questionnaire";
import { btnPrimary, btnSecondary, card, errorText, pill } from "@/lib/ui";

interface Previous {
  answers: QuestionnaireAnswers;
  submittedAt: string;
}

/**
 * Entry point for /questionnaire. First-time users go straight to the form.
 * Returning users see their last submission and can connect directly with
 * it, or switch to the (prefilled) form to update it first.
 */
export function QuestionnaireIntake({ previous }: { previous: Previous | null }) {
  const [mode, setMode] = useState<"summary" | "form">(previous ? "summary" : "form");

  if (!previous || mode === "form") {
    return (
      <QuestionnaireForm
        initialAnswers={previous?.answers}
        onCancel={previous ? () => setMode("summary") : undefined}
      />
    );
  }

  return <ReturningSummary previous={previous} onUpdate={() => setMode("form")} />;
}

function ReturningSummary({
  previous,
  onUpdate,
}: {
  previous: Previous;
  onUpdate: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/questionnaire/connect", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Something went wrong");
      return;
    }
    if (!data.sessionId) {
      setError(data.message ?? "No providers available right now.");
      return;
    }
    router.push(`/chat/${data.sessionId}`);
  }

  const submittedDate = new Date(previous.submittedAt).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="rise mx-auto max-w-xl">
      <h1 className="font-serif text-4xl font-medium tracking-tight text-ink">
        Welcome back
      </h1>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
        You answered our intake questionnaire on {submittedDate}. Connect with
        a provider using those answers, or update them first.
      </p>

      <div className={`mt-8 ${card}`}>
        <p className="text-sm font-medium text-ink-soft">
          What you&apos;re looking for support with
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {previous.answers.concerns.map((tag) => (
            <span key={tag} className={`${pill} bg-fern-mist py-1 text-fern-deep`}>
              {CONCERN_LABELS[tag]}
            </span>
          ))}
        </div>
      </div>

      {error && <p className={`mt-6 ${errorText}`}>{error}</p>}

      <div className="mt-8 flex flex-wrap gap-4">
        <button
          onClick={connect}
          disabled={busy}
          className={`${btnPrimary} px-8 py-3`}
        >
          {busy ? "Connecting you with a provider…" : "Connect me with a provider"}
        </button>
        <button type="button" onClick={onUpdate} className={btnSecondary}>
          Update my answers
        </button>
      </div>
    </div>
  );
}
