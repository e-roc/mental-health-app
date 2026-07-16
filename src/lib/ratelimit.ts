import { NextResponse } from "next/server";

/**
 * Fixed-window in-memory rate limiter.
 *
 * Per-instance state: with N horizontal instances behind a balancer the
 * effective limit is up to N× the configured one — acceptable for abuse
 * throttling. Move the counters to Redis if exact global limits are needed;
 * the call sites won't change.
 */

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
const MAX_ENTRIES = 100_000;

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

/** Returns true when the call is allowed. */
export function checkRateLimit(key: string, opts: RateLimitOptions): boolean {
  const now = Date.now();
  const win = windows.get(key);
  if (!win || win.resetAt <= now) {
    if (windows.size >= MAX_ENTRIES) sweep(now);
    windows.set(key, { count: 1, resetAt: now + opts.windowMs });
    return true;
  }
  win.count += 1;
  return win.count <= opts.limit;
}

function sweep(now: number): void {
  for (const [key, win] of windows) {
    if (win.resetAt <= now) windows.delete(key);
  }
  // Under sustained attack pressure everything may still be live; drop the
  // oldest half rather than growing without bound.
  if (windows.size >= MAX_ENTRIES) {
    let toDrop = Math.floor(windows.size / 2);
    for (const key of windows.keys()) {
      if (toDrop-- <= 0) break;
      windows.delete(key);
    }
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/**
 * Route-handler guard. Returns a 429 response when the caller is over the
 * limit, or null when the request may proceed.
 */
export function rateLimitOr429(
  req: Request,
  bucket: string,
  opts: RateLimitOptions,
  discriminator?: string
): NextResponse | null {
  const key = `${bucket}:${discriminator ?? clientIp(req)}`;
  if (checkRateLimit(key, opts)) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(opts.windowMs / 1000)) } }
  );
}

/** Test hook. */
export function resetRateLimiter(): void {
  windows.clear();
}
