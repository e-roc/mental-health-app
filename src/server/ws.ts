import type { IncomingMessage, Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { SESSION_COOKIE } from "@/lib/constants";
import { getBus, type AppEvent } from "@/lib/pubsub";
import { ADMIN_CHANNEL } from "@/lib/events";
import type { Role, User } from "@prisma/client";

/**
 * WebSocket push layer.
 *
 * Clients connect to /ws (authenticated by the same httpOnly session cookie
 * as the REST API) and subscribe to channels. The server authorizes each
 * subscription, bridges it to the cross-instance event bus, and pushes
 * events. Events are refetch signals only — clients reload data through the
 * authorized REST API, so no PII ever travels over the socket.
 *
 * Channels:
 *   session:<id>     — the two chat participants
 *   provider:<userId> — that provider (incoming ping notifications)
 *   admin             — admins
 */

interface ClientState {
  user: User;
  unsubscribers: Map<string, () => void>;
  alive: boolean;
  lastBroadcast: Map<string, number>;
}

const MAX_SUBSCRIPTIONS_PER_CLIENT = 20;
const BROADCAST_THROTTLE_MS = 250;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

async function authenticate(req: IncomingMessage): Promise<User | null> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/**
 * Map client-facing channel names to bus channels. "provider:self" lets a
 * provider subscribe to their own feed without knowing their user id.
 */
function resolveChannel(user: User, channel: string): string {
  if (channel === "provider:self") return `provider:${user.id}`;
  return channel;
}

async function authorizeChannel(user: User, channel: string): Promise<boolean> {
  if (channel === ADMIN_CHANNEL) return user.role === ("ADMIN" as Role);

  const [kind, id] = channel.split(":", 2);
  if (!id) return false;

  if (kind === "provider") {
    // Providers may only listen to their own ping feed.
    return user.role === "PROVIDER" && id === user.id;
  }
  if (kind === "session") {
    const session = await prisma.chatSession.findUnique({
      where: { id },
      select: { userId: true, provider: { select: { userId: true } } },
    });
    if (!session) return false;
    return session.userId === user.id || session.provider.userId === user.id;
  }
  return false;
}

type UpgradeFallback = (
  req: IncomingMessage,
  socket: import("stream").Duplex,
  head: Buffer
) => void;

export function attachWebSocketServer(
  server: Server,
  fallback?: UpgradeFallback
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const bus = getBus();

  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/ws") {
      // Not ours — hand off to Next (dev HMR websocket) or drop.
      if (fallback) fallback(req, socket, head);
      else socket.destroy();
      return;
    }
    let user: User | null = null;
    try {
      user = await authenticate(req);
    } catch {
      user = null;
    }
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, user);
    });
  });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage, user: User) => {
    const state: ClientState = {
      user,
      unsubscribers: new Map(),
      alive: true,
      lastBroadcast: new Map(),
    };

    ws.on("pong", () => {
      state.alive = true;
    });

    ws.on("message", async (raw) => {
      let msg: { type?: string; channel?: string; event?: { type?: string } };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (typeof msg.channel !== "string" || msg.channel.length > 200) return;

      if (msg.type === "broadcast") {
        // Narrow, ephemeral relay: only "typing" pings, and only to channels
        // this connection already subscribed to (so already authorized).
        // Never persisted — the bus just fans it out to live subscribers.
        const requested = msg.channel;
        if (!state.unsubscribers.has(requested)) return;
        if (msg.event?.type !== "typing") return;
        const now = Date.now();
        const last = state.lastBroadcast.get(requested) ?? 0;
        if (now - last < BROADCAST_THROTTLE_MS) return;
        state.lastBroadcast.set(requested, now);
        const actual = resolveChannel(user, requested);
        await bus.publish(actual, { type: "typing", senderId: user.id });
      } else if (msg.type === "subscribe") {
        const requested = msg.channel;
        const actual = resolveChannel(user, requested);
        if (state.unsubscribers.has(requested)) return;
        if (state.unsubscribers.size >= MAX_SUBSCRIPTIONS_PER_CLIENT) {
          ws.send(JSON.stringify({ type: "error", error: "too many subscriptions" }));
          return;
        }
        const ok = await authorizeChannel(user, actual).catch(() => false);
        if (!ok) {
          ws.send(JSON.stringify({ type: "denied", channel: requested }));
          return;
        }
        const unsub = bus.subscribe(actual, (_channel, event: AppEvent) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "event", channel: requested, event }));
          }
        });
        state.unsubscribers.set(requested, unsub);
        ws.send(JSON.stringify({ type: "subscribed", channel: requested }));
      } else if (msg.type === "unsubscribe") {
        state.unsubscribers.get(msg.channel)?.();
        state.unsubscribers.delete(msg.channel);
      }
    });

    ws.on("close", () => {
      for (const unsub of state.unsubscribers.values()) unsub();
      state.unsubscribers.clear();
    });

    // Liveness: drop clients that miss two ping rounds so dead sockets don't
    // accumulate subscriptions.
    const interval = setInterval(() => {
      if (!state.alive) {
        ws.terminate();
        clearInterval(interval);
        return;
      }
      state.alive = false;
      ws.ping();
    }, 30_000);
    ws.on("close", () => clearInterval(interval));
  });

  return wss;
}
