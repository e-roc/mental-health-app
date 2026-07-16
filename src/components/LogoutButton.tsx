"use client";

import { useRouter } from "next/navigation";
import { btnQuiet } from "@/lib/ui";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className={btnQuiet}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}
