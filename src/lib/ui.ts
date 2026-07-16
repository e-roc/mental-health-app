// Shared visual vocabulary. Every interactive surface pulls from here so the
// spa language (pill buttons, soft fields, quiet cards) stays consistent.

export const btnPrimary =
  "inline-flex items-center justify-center rounded-full bg-fern px-6 py-2.5 text-sm font-semibold tracking-wide text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-fern-deep hover:shadow-[0_12px_24px_-12px_rgba(61,99,85,0.5)] active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const btnSecondary =
  "inline-flex items-center justify-center rounded-full border border-edge bg-surface px-6 py-2.5 text-sm font-semibold tracking-wide text-ink-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-fern hover:text-fern-deep active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const btnQuiet =
  "text-sm text-ink-soft transition-colors duration-300 hover:text-fern-deep";

export const field =
  "mt-1.5 w-full rounded-xl border border-edge bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-colors duration-300 focus:border-fern focus:outline-none focus:ring-2 focus:ring-fern/25 disabled:bg-mist disabled:text-ink-faint";

export const fieldLabel = "text-sm font-medium text-ink-soft";

export const card =
  "rounded-2xl border border-edge/70 bg-surface p-6 shadow-[0_20px_45px_-32px_rgba(34,51,44,0.35)]";

export const pill =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold";

export const errorText = "text-sm text-rose";

export const sectionTitle = "font-serif text-2xl font-semibold text-ink";
