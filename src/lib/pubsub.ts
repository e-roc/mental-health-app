import { Client } from "pg";

/**
 * Cross-instance event bus.
 *
 * All app instances publish and subscribe through Postgres LISTEN/NOTIFY on a
 * single "app_events" channel; each payload carries its logical channel
 * (session:<id>, provider:<userId>, admin) and instances fan out to their own
 * local WebSocket subscribers. This keeps realtime working with N horizontal
 * instances without extra infrastructure; swap PgBus for a Redis
 * implementation later by satisfying the same EventBus interface.
 *
 * Payloads are invalidation signals only (type + ids) — never PII or message
 * content, which clients refetch over the authorized REST API.
 */

export interface AppEvent {
  type: string;
  [key: string]: unknown;
}

export type Subscriber = (channel: string, event: AppEvent) => void;

export interface EventBus {
  publish(channel: string, event: AppEvent): Promise<void>;
  subscribe(channel: string, fn: Subscriber): () => void;
  close(): Promise<void>;
}

const PG_CHANNEL = "app_events";

abstract class BaseBus implements EventBus {
  protected subscribers = new Map<string, Set<Subscriber>>();

  abstract publish(channel: string, event: AppEvent): Promise<void>;
  abstract close(): Promise<void>;

  subscribe(channel: string, fn: Subscriber): () => void {
    let set = this.subscribers.get(channel);
    if (!set) {
      set = new Set();
      this.subscribers.set(channel, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subscribers.delete(channel);
    };
  }

  protected dispatch(channel: string, event: AppEvent): void {
    const set = this.subscribers.get(channel);
    if (!set) return;
    for (const fn of set) {
      try {
        fn(channel, event);
      } catch (err) {
        console.error("[pubsub] subscriber threw", err);
      }
    }
  }
}

/** In-process bus for tests and single-process fallback. */
export class MemoryBus extends BaseBus {
  async publish(channel: string, event: AppEvent): Promise<void> {
    this.dispatch(channel, event);
  }
  async close(): Promise<void> {
    this.subscribers.clear();
  }
}

/** Postgres LISTEN/NOTIFY bus for multi-instance deployments. */
export class PgBus extends BaseBus {
  private listener: Client | null = null;
  private notifier: Client | null = null;
  private closed = false;
  private connecting: Promise<void> | null = null;

  constructor(private connectionString: string) {
    super();
  }

  private async ensureConnected(): Promise<void> {
    if (this.listener && this.notifier) return;
    if (!this.connecting) {
      this.connecting = this.connect().finally(() => {
        this.connecting = null;
      });
    }
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const listener = new Client({ connectionString: this.connectionString });
    const notifier = new Client({ connectionString: this.connectionString });
    await Promise.all([listener.connect(), notifier.connect()]);

    listener.on("notification", (msg) => {
      if (msg.channel !== PG_CHANNEL || !msg.payload) return;
      try {
        const { channel, event } = JSON.parse(msg.payload);
        if (typeof channel === "string" && event && typeof event.type === "string") {
          this.dispatch(channel, event);
        }
      } catch {
        console.error("[pubsub] malformed notification payload");
      }
    });
    const onError = (err: Error) => {
      console.error("[pubsub] pg connection error", err.message);
      this.listener = null;
      this.notifier = null;
      if (!this.closed) {
        setTimeout(() => this.ensureConnected().catch(() => {}), 1000);
      }
    };
    listener.on("error", onError);
    notifier.on("error", onError);

    await listener.query(`LISTEN ${PG_CHANNEL}`);
    this.listener = listener;
    this.notifier = notifier;
  }

  async publish(channel: string, event: AppEvent): Promise<void> {
    await this.ensureConnected();
    // NOTIFY payloads are capped at ~8KB; our events are tiny id/type signals.
    await this.notifier!.query(`SELECT pg_notify($1, $2)`, [
      PG_CHANNEL,
      JSON.stringify({ channel, event }),
    ]);
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled([this.listener?.end(), this.notifier?.end()]);
    this.listener = null;
    this.notifier = null;
    this.subscribers.clear();
  }
}

const globalForBus = globalThis as unknown as { appEventBus?: EventBus };

export function getBus(): EventBus {
  if (!globalForBus.appEventBus) {
    const url = process.env.DATABASE_URL;
    globalForBus.appEventBus =
      url && url.startsWith("postgres")
        ? new PgBus(url)
        : new MemoryBus();
  }
  return globalForBus.appEventBus;
}
