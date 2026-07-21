"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CONCERN_LABELS,
  CONCERN_TAGS,
  FREQUENCY_LABELS,
  FREQUENCY_OPTIONS,
  type QuestionnaireAnswers,
} from "@/lib/questionnaire";
import { btnPrimary, btnQuiet, errorText } from "@/lib/ui";

const legendStyle = "font-serif text-lg font-semibold text-ink";
const optionRow =
  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-soft transition-colors duration-200 hover:bg-fern-mist/60 has-[:checked]:bg-fern-mist has-[:checked]:text-fern-deep";
const control = "size-4 accent-fern";

function FrequencyField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <fieldset>
      <legend className={legendStyle}>{label}</legend>
      <div className="mt-3 space-y-1">
        {FREQUENCY_OPTIONS.map((opt) => (
          <label key={opt} className={optionRow}>
            <input
              type="radio"
              name={name}
              value={opt}
              required
              defaultChecked={defaultValue === opt}
              className={control}
            />
            {FREQUENCY_LABELS[opt]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function QuestionnaireForm({
  initialAnswers,
  onCancel,
}: {
  /** Prefills the form — used when a returning user chooses to update. */
  initialAnswers?: QuestionnaireAnswers;
  /** Shown as a "Cancel" link back to the saved-answers summary, if any. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      concerns: form.getAll("concerns").map(String),
      moodFrequency: String(form.get("moodFrequency")),
      anxietyFrequency: String(form.get("anxietyFrequency")),
      sleepQuality: String(form.get("sleepQuality")),
      priorSupport: String(form.get("priorSupport")),
      safetyConcern: String(form.get("safetyConcern")),
      additionalNotes: String(form.get("additionalNotes") ?? ""),
    };
    const res = await fetch("/api/questionnaire", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
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

  return (
    <div className="rise mx-auto max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl font-medium tracking-tight text-ink">
            {initialAnswers ? "Update your answers" : "Tell us how you're doing"}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
            Your answers are private, encrypted, and only used to connect you
            with the right provider.
          </p>
        </div>
        {onCancel && (
          <button type="button" onClick={onCancel} className={`${btnQuiet} shrink-0`}>
            Cancel
          </button>
        )}
      </div>
      <form onSubmit={onSubmit} className="mt-10 space-y-10">
        <fieldset>
          <legend className={legendStyle}>
            What would you like support with? (select all that apply)
          </legend>
          <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {CONCERN_TAGS.map((tag) => (
              <label key={tag} className={optionRow}>
                <input
                  type="checkbox"
                  name="concerns"
                  value={tag}
                  defaultChecked={initialAnswers?.concerns.includes(tag)}
                  className={control}
                />
                {CONCERN_LABELS[tag]}
              </label>
            ))}
          </div>
        </fieldset>

        <FrequencyField
          name="moodFrequency"
          label="Over the last 2 weeks, how often have you felt down, depressed, or hopeless?"
          defaultValue={initialAnswers?.moodFrequency}
        />
        <FrequencyField
          name="anxietyFrequency"
          label="Over the last 2 weeks, how often have you felt nervous, anxious, or on edge?"
          defaultValue={initialAnswers?.anxietyFrequency}
        />

        <fieldset>
          <legend className={legendStyle}>How has your sleep been?</legend>
          <div className="mt-3 space-y-1">
            {(["good", "fair", "poor"] as const).map((opt) => (
              <label key={opt} className={`${optionRow} capitalize`}>
                <input
                  type="radio"
                  name="sleepQuality"
                  value={opt}
                  required
                  defaultChecked={initialAnswers?.sleepQuality === opt}
                  className={control}
                />
                {opt}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={legendStyle}>
            Have you worked with a mental health professional before?
          </legend>
          <div className="mt-3 space-y-1">
            {(["yes", "no"] as const).map((opt) => (
              <label key={opt} className={`${optionRow} capitalize`}>
                <input
                  type="radio"
                  name="priorSupport"
                  value={opt}
                  required
                  defaultChecked={initialAnswers?.priorSupport === opt}
                  className={control}
                />
                {opt}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={legendStyle}>
            Are you having thoughts of harming yourself or others?
          </legend>
          <div className="mt-3 space-y-1">
            {(["yes", "no"] as const).map((opt) => (
              <label key={opt} className={`${optionRow} capitalize`}>
                <input
                  type="radio"
                  name="safetyConcern"
                  value={opt}
                  required
                  defaultChecked={initialAnswers?.safetyConcern === opt}
                  className={control}
                />
                {opt}
              </label>
            ))}
          </div>
          <p className="mt-3 rounded-xl bg-clay-mist px-4 py-3 text-xs leading-relaxed text-clay">
            If you are in immediate danger, please call 988 or your local
            emergency number right now — don&apos;t wait for a chat session.
          </p>
        </fieldset>

        <label className="block">
          <span className={legendStyle}>
            Anything else you&apos;d like your provider to know? (optional)
          </span>
          <textarea
            name="additionalNotes"
            maxLength={2000}
            rows={4}
            defaultValue={initialAnswers?.additionalNotes}
            className="mt-3 w-full rounded-xl border border-edge bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors duration-300 focus:border-fern focus:outline-none focus:ring-2 focus:ring-fern/25"
          />
        </label>

        {error && <p className={errorText}>{error}</p>}
        <button disabled={busy} className={`${btnPrimary} w-full py-3.5`}>
          {busy
            ? "Connecting you with a provider…"
            : initialAnswers
              ? "Save and connect me with a provider"
              : "Connect me with a provider"}
        </button>
      </form>
    </div>
  );
}
