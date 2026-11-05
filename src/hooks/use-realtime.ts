"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAppStore, isGuest } from "@/lib/store";
import { localizeRealtimeNotification } from "@/lib/i18n";

export interface RealtimeEvent {
  type:
    | "CONNECTED"
    | "PING"
    | "SUBSCRIPTION_ACTIVATED"
    | "PAYMENT_REJECTED"
    | "TELEGRAM_LINKED"
    | "LEAD_RECEIVED"
    | "APPOINTMENT_CREATED"
    | "APPOINTMENT_UPDATED"
    | "STAFF_UPDATED"
    | "TEST_NOTIFICATION"
    | string;
  title?: string;
  message?: string;
  timestamp?: string;
  payload?: Record<string, unknown>;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useRealtime() {
  const me = useAppStore((s) => s.me);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const connectRef = useRef<() => void>(() => {});

  const connect = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!me || isGuest(me)) {
      setStatus("disconnected");
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setStatus("connecting");

    const es = new EventSource("/api/realtime/stream", { withCredentials: true });
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus("connected");
      retryCountRef.current = 0;
    };

    es.addEventListener("message", (e) => {
      try {
        const data: RealtimeEvent = JSON.parse(e.data);
        setLastEvent(data);

        // Broadcast to custom window event so any tab/subcomponent can react
        window.dispatchEvent(new CustomEvent("khlan:realtime", { detail: data }));

        const localized = localizeRealtimeNotification(useAppStore.getState().locale, data);
        if (!localized) return;

        if (data.type === "SUBSCRIPTION_ACTIVATED") {
          toast.success(localized.title, { description: localized.message, duration: 8000 });
        } else if (data.type === "PAYMENT_REJECTED") {
          toast.error(localized.title, { description: localized.message, duration: 8000 });
        } else if (data.type === "TELEGRAM_LINKED") {
          toast.success(localized.title, { description: localized.message, duration: 7000 });
        } else if (data.type === "APPOINTMENT_CREATED") {
          toast.info(localized.title, { description: localized.message, duration: 6000 });
        } else if (data.type === "TEST_NOTIFICATION") {
          toast.info(localized.title, { description: localized.message, duration: 5000 });
        } else if (data.type === "SAVED_SEARCH_MATCH") {
          toast.success(localized.title, { description: localized.message, duration: 8000 });
        } else if (data.type === "LEAD_FOLLOWUP") {
          toast.info(localized.title, { description: localized.message, duration: 8000 });
        }
      } catch (err) {
        console.warn("[Realtime] Failed to parse SSE event data:", err);
      }
    });

    es.addEventListener("ping", () => {
      // Keep-alive heartbeat received
      setStatus("connected");
    });

    es.onerror = () => {
      setStatus("disconnected");
      es.close();

      // Exponential backoff reconnect
      const delay = Math.min(15000, 1000 * Math.pow(2, retryCountRef.current));
      retryCountRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(() => {
        connectRef.current();
      }, delay);
    };
  }, [me]);

  useEffect(() => {
    connectRef.current = connect;
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return { status, lastEvent };
}

/**
 * Hook to listen for a specific realtime event type and trigger a handler.
 */
export function useRealtimeEvent(
  targetType: string | string[],
  handler: (event: RealtimeEvent) => void,
) {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const listener = (e: Event) => {
      const customEvent = e as CustomEvent<RealtimeEvent>;
      const event = customEvent.detail;
      if (!event) return;

      const types = Array.isArray(targetType) ? targetType : [targetType];
      if (types.includes(event.type) || types.includes("*")) {
        handlerRef.current(event);
      }
    };

    window.addEventListener("khlan:realtime", listener);
    return () => {
      window.removeEventListener("khlan:realtime", listener);
    };
  }, [targetType]);
}
