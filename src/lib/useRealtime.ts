"use client";

import { useCallback, useEffect, useRef } from "react";

export interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Realtime refetch signal hook.
 *
 * Opens a WebSocket to /ws, subscribes to the given channels, and invokes
 * onSignal whenever the server pushes a data-changing event — plus once on
 * mount, on every reconnect, and on a slow safety interval in case the
 * socket is down. The callback is expected to refetch via the REST API;
 * events carry no data of their own.
 *
 * "typing" events are the one exception: they're ephemeral UI signals, not
 * data changes, so they never trigger onSignal. Pass onEvent to observe them,
 * and use the returned send() to emit one back over the same socket.
 */
export function useRealtime(
  channels: string[],
  onSignal: () => void | Promise<void>,
  safetyPollMs = 30_000,
  onEvent?: (channel: string, event: RealtimeEvent) => void
): { send: (channel: string, event: RealtimeEvent) => void } {
  const signalRef = useRef(onSignal);
  const eventRef = useRef(onEvent);
  const wsRef = useRef<WebSocket | null>(null);
  useEffect(() => {
    signalRef.current = onSignal;
  }, [onSignal]);
  useEffect(() => {
    eventRef.current = onEvent;
  }, [onEvent]);
  const channelKey = channels.join(",");

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retryMs = 1_000;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fire = () => void signalRef.current();

    function connect() {
      if (closed) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryMs = 1_000;
        for (const channel of channelKey.split(",").filter(Boolean)) {
          ws?.send(JSON.stringify({ type: "subscribe", channel }));
        }
        // Catch up on anything missed while disconnected.
        fire();
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type !== "event") return;
          const event: RealtimeEvent | undefined = msg.event;
          if (event) eventRef.current?.(msg.channel, event);
          // Ephemeral signals don't carry new data — nothing to refetch.
          if (event?.type !== "typing") fire();
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (closed) return;
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 30_000);
      };
      ws.onerror = () => ws?.close();
    }

    const kick = setTimeout(fire, 0);
    connect();
    const safety = setInterval(fire, safetyPollMs);

    return () => {
      closed = true;
      clearTimeout(kick);
      clearInterval(safety);
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
      wsRef.current = null;
    };
  }, [channelKey, safetyPollMs]);

  const send = useCallback((channel: string, event: RealtimeEvent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "broadcast", channel, event }));
    }
  }, []);

  return { send };
}
