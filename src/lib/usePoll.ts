"use client";

import { useEffect } from "react";

/**
 * Run an async loader immediately (deferred out of the effect body) and then
 * on an interval. Shared by chat, provider, and admin views.
 */
export function usePoll(fn: () => void | Promise<void>, intervalMs: number) {
  useEffect(() => {
    const kick = setTimeout(fn, 0);
    const timer = setInterval(fn, intervalMs);
    return () => {
      clearTimeout(kick);
      clearInterval(timer);
    };
  }, [fn, intervalMs]);
}
