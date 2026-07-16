import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { btnPrimary, btnSecondary } from "@/lib/ui";

const PILLARS: [string, string][] = [
  [
    "Private by design",
    "Your personal details and conversations are encrypted at rest.",
  ],
  [
    "Matched to you",
    "We match you with a provider whose focus areas fit your needs.",
  ],
  ["Real-time chat", "Providers join within minutes of your request."],
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="relative">
      {/* Breathing field: two slow orbs pacing a calm exhale */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -top-24 -z-10 h-[32rem] w-screen -translate-x-1/2 overflow-hidden"
      >
        <div className="breathe absolute -left-24 top-8 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,rgba(77,122,106,0.22),transparent_65%)]" />
        <div className="breathe breathe-late absolute -right-16 top-24 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(156,91,65,0.14),transparent_65%)]" />
      </div>

      <section className="mx-auto max-w-3xl pb-20 pt-16 sm:pt-24">
        <p className="rise text-sm font-semibold uppercase tracking-[0.2em] text-fern">
          A quiet place to start
        </p>
        <h1 className="rise rise-2 mt-4 font-serif text-5xl font-medium leading-[1.08] tracking-tight text-ink sm:text-6xl">
          Support, when you
          <br />
          need it <em className="text-fern-deep">most</em>
        </h1>
        <p className="rise rise-3 mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
          Answer a short questionnaire and we&apos;ll connect you with an
          available mental health provider for a secure, private chat.
        </p>
        <div className="rise rise-4 mt-10 flex flex-wrap gap-4">
          {user?.role === "USER" ? (
            <Link href="/questionnaire" className={`${btnPrimary} px-8 py-3`}>
              Start questionnaire
            </Link>
          ) : user ? null : (
            <>
              <Link href="/register" className={`${btnPrimary} px-8 py-3`}>
                Get started
              </Link>
              <Link href="/login" className={`${btnSecondary} px-8 py-3`}>
                Log in
              </Link>
            </>
          )}
        </div>
      </section>

      <section className="rise rise-4 grid gap-10 border-t border-edge pt-12 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-edge">
        {PILLARS.map(([title, body], i) => (
          <div key={title} className={i === 0 ? "sm:pr-8" : "sm:px-8"}>
            <h3 className="font-serif text-xl font-semibold text-ink">
              {title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{body}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
