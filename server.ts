import "@/server/load-env";
import { createServer } from "http";
import next from "next";
import { validateEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { getBus } from "@/lib/pubsub";
import { attachWebSocketServer } from "@/server/ws";
import { sweepExpiredSessions } from "@/lib/router";
import { syncScheduledAvailability } from "@/lib/availability";

/**
 * Custom server: Next.js request handling + WebSocket push + background jobs.
 *
 * Horizontal scale notes:
 * - Any number of these processes can run behind a load balancer; realtime
 *   events fan out across instances via Postgres LISTEN/NOTIFY (lib/pubsub).
 * - Background jobs run on every instance; all mutations they perform are
 *   conditional updates, so overlapping runs are harmless (last writer sees
 *   zero matched rows). Move to a dedicated worker or pg-boss/cron when job
 *   volume justifies it.
 */

validateEnv();

const dev = process.env.NODE_ENV !== "production";
// When PORT is set explicitly we honor it exactly and fail on conflict. When
// it's unset we start from 3000 and probe upward on EADDRINUSE so a stray
// process on the default port doesn't block local dev.
const portExplicit = process.env.PORT != null && process.env.PORT !== "";
const startPort = Number(process.env.PORT ?? 3000);
const MAX_PORT_ATTEMPTS = 20;

const EXPIRY_SWEEP_MS = 10_000;
const AVAILABILITY_SYNC_MS = 30_000;
const AUTH_CLEANUP_MS = 60 * 60_000;

async function main() {
  const app = next({ dev });
  await app.prepare();
  const handle = app.getRequestHandler();
  const nextUpgrade = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    // CSRF hardening: browsers always attach Origin to cross-site state
    // changes. A mismatched Origin on a mutating /api call is rejected before
    // it reaches any handler. Requests without Origin (curl, server-to-server)
    // pass through — they can't ride a victim's cookies.
    if (
      req.url?.startsWith("/api/") &&
      req.method &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      const origin = req.headers.origin;
      if (origin) {
        try {
          if (new URL(origin).host !== req.headers.host) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Cross-origin request rejected" }));
            return;
          }
        } catch {
          res.writeHead(403).end();
          return;
        }
      }
    }
    handle(req, res);
  });
  attachWebSocketServer(server, (req, socket, head) =>
    nextUpgrade(req, socket, head)
  );

  const timers = [
    setInterval(() => {
      sweepExpiredSessions().catch((err) =>
        console.error("[jobs] session sweep failed", err)
      );
    }, EXPIRY_SWEEP_MS),
    setInterval(() => {
      syncScheduledAvailability().catch((err) =>
        console.error("[jobs] availability sync failed", err)
      );
    }, AVAILABILITY_SYNC_MS),
    setInterval(() => {
      prisma.authSession
        .deleteMany({ where: { expiresAt: { lte: new Date() } } })
        .catch((err) => console.error("[jobs] auth cleanup failed", err));
    }, AUTH_CLEANUP_MS),
  ];

  const listen = (port: number, attemptsLeft: number) => {
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EADDRINUSE") throw err;
      if (portExplicit || attemptsLeft <= 0) {
        console.error(
          `[server] port ${port} in use${
            portExplicit ? "" : ` (gave up after ${MAX_PORT_ATTEMPTS} attempts)`
          }`
        );
        process.exit(1);
      }
      console.warn(`[server] port ${port} in use, trying ${port + 1}`);
      listen(port + 1, attemptsLeft - 1);
    });
    server.listen(port, () => {
      console.log(
        `[server] ready on http://localhost:${port} (${dev ? "dev" : "production"})`
      );
    });
  };
  listen(startPort, MAX_PORT_ATTEMPTS);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[server] ${signal} received, shutting down`);
    for (const t of timers) clearInterval(t);
    server.close();
    await Promise.allSettled([getBus().close(), prisma.$disconnect()]);
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[server] fatal", err);
  process.exit(1);
});
