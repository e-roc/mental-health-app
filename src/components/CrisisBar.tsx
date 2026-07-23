"use client";

import { usePathname } from "next/navigation";
import { shouldShowCrisisBar } from "@/lib/crisisBar";

/**
 * Top crisis-support bar. Client component so it can read the current pathname;
 * server-side role is passed in. Visibility is decided by `shouldShowCrisisBar`.
 */
export function CrisisBar({ isProvider }: { isProvider: boolean }) {
  const pathname = usePathname();
  if (!shouldShowCrisisBar(isProvider ? "PROVIDER" : null, pathname)) {
    return null;
  }
  return (
    <div className="border-b border-clay/15 bg-clay-mist px-6 py-2 text-center text-xs text-clay">
      If you are in crisis or thinking about harming yourself, call or text{" "}
      <strong>988</strong>&nbsp;(Suicide &amp; Crisis Lifeline, US) or your local
      emergency number now.
    </div>
  );
}
