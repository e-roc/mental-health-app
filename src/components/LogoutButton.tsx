"use client";

import { useRouter } from "next/navigation";
import { btnQuiet } from "@/lib/ui";

export function LogoutButton({ redirectTo = "/" }: { redirectTo?: string }) {
  const router = useRouter();
  return (
    <button
      className={btnQuiet}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push(redirectTo);
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
