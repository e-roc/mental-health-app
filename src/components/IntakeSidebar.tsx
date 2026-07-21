"use client";

import { useEffect, useState } from "react";
import {
  CONCERN_LABELS,
  FIELD_LABELS,
  FREQUENCY_LABELS,
  SLEEP_LABELS,
  YES_NO_LABELS,
  type QuestionnaireAnswers,
} from "@/lib/questionnaire";
import { errorText, pill } from "@/lib/ui";

type Intake = {
  answers: QuestionnaireAnswers | null;
  riskLevel: "LOW" | "MODERATE" | "HIGH";
  createdAt: string;
};

const RISK_PILL: Record<Intake["riskLevel"], string> = {
  LOW: "bg-moss-mist text-moss",
  MODERATE: "bg-clay-mist text-clay",
  HIGH: "bg-rose-mist text-rose",
};

const STORAGE_KEY = "intake-sidebar-collapsed";

export function IntakeSidebar({ sessionId }: { sessionId: string }) {
  const [collapsed, setCollapsed] = useState(false);
  // undefined = loading, null = no intake on file, Intake = loaded.
  const [intake, setIntake] = useState<Intake | null | undefined>(undefined);
  const [error, setError] = useState(false);

  // Seed collapse from localStorage after mount to avoid an SSR mismatch.
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/sessions/${sessionId}/questionnaire`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("load failed");
        const data = await res.json();
        if (active) setIntake(data.questionnaire);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [sessionId]);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  if (collapsed) {
    return (
      <button
        onClick={toggle}
        aria-label="Show patient intake"
        className="flex h-[70vh] w-10 shrink-0 flex-col items-center gap-2 rounded-3xl border border-edge/70 bg-surface py-4 text-ink-soft transition-colors hover:text-fern-deep"
      >
        <span aria-hidden>›</span>
        <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl]">
          Intake
        </span>
      </button>
    );
  }

  return (
    <aside className="flex h-[70vh] w-80 shrink-0 flex-col overflow-hidden rounded-3xl border border-edge/70 bg-surface">
      <div className="flex items-center justify-between border-b border-edge/70 px-5 py-4">
        <p className="font-serif text-lg font-semibold text-ink">
          Patient intake
        </p>
        <button
          onClick={toggle}
          aria-label="Hide patient intake"
          className="text-ink-soft transition-colors hover:text-fern-deep"
        >
          ‹
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
        {error ? (
          <p className={errorText}>Unable to load intake</p>
        ) : intake === undefined ? (
          <p className="text-ink-faint">Loading intake…</p>
        ) : intake === null ? (
          <p className="text-ink-faint">No intake on file</p>
        ) : (
          <IntakeBody intake={intake} />
        )}
      </div>
    </aside>
  );
}

function IntakeBody({ intake }: { intake: Intake }) {
  const { answers, riskLevel, createdAt } = intake;
  return (
    <>
      <div className="flex items-center justify-between">
        <span className={`${pill} ${RISK_PILL[riskLevel]}`}>
          {riskLevel} risk
        </span>
        <span className="text-xs text-ink-faint">
          {new Date(createdAt).toLocaleDateString()}
        </span>
      </div>

      {answers === null ? (
        <p className="text-ink-faint">Intake is unreadable</p>
      ) : (
        <>
          <Field label="Concerns">
            <div className="flex flex-wrap gap-1.5">
              {answers.concerns.map((c) => (
                <span key={c} className={`${pill} bg-fern-mist text-fern-deep`}>
                  {CONCERN_LABELS[c]}
                </span>
              ))}
            </div>
          </Field>
          <Field label={FIELD_LABELS.moodFrequency}>
            {FREQUENCY_LABELS[answers.moodFrequency]}
          </Field>
          <Field label={FIELD_LABELS.anxietyFrequency}>
            {FREQUENCY_LABELS[answers.anxietyFrequency]}
          </Field>
          <Field label={FIELD_LABELS.sleepQuality}>
            {SLEEP_LABELS[answers.sleepQuality]}
          </Field>
          <Field label={FIELD_LABELS.priorSupport}>
            {YES_NO_LABELS[answers.priorSupport]}
          </Field>
          <Field label={FIELD_LABELS.safetyConcern}>
            {YES_NO_LABELS[answers.safetyConcern]}
          </Field>
          {answers.additionalNotes.trim() && (
            <Field label={FIELD_LABELS.additionalNotes}>
              <p className="whitespace-pre-wrap text-ink-soft">
                {answers.additionalNotes}
              </p>
            </Field>
          )}
        </>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <div className="mt-1 text-ink">{children}</div>
    </div>
  );
}
