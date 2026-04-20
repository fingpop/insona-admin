"use client";

import { useEffect, useReducer, useRef, useCallback } from "react";

interface GatewayEvent {
  type: string;
  gatewayId?: string;
  payload?: Record<string, unknown>;
}

interface DeviceState {
  [did: string]: { func: number; value: number[] };
}

interface GatewayState {
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
  lastEvent: GatewayEvent | null;
  devices: DeviceState;
}

type Action =
  | { type: "STATUS"; status: GatewayState["status"] }
  | { type: "EVENT"; event: GatewayEvent }
  | { type: "DEVICE_STATUS"; did: string; func: number; value: number[] };

function reducer(state: GatewayState, action: Action): GatewayState {
  switch (action.type) {
    case "STATUS":
      return { ...state, status: action.status };
    case "EVENT":
      return { ...state, lastEvent: action.event };
    case "DEVICE_STATUS":
      return {
        ...state,
        devices: {
          ...state.devices,
          [action.did]: { func: action.func, value: action.value },
        },
      };
    default:
      return state;
  }
}

const initialState: GatewayState = {
  status: "disconnected",
  lastEvent: null,
  devices: {},
};

type EventCallback = (event: GatewayEvent) => void;

export function useGatewayEvents() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const esRef = useRef<EventSource | null>(null);
  const subscribersRef = useRef<Set<EventCallback>>(new Set());

  const subscribe = useCallback((callback: EventCallback): (() => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");
    esRef.current = es;

    es.onopen = () => {
      // Get aggregated gateway status
      fetch("/api/gateway/status")
        .then((r) => r.json())
        .then((d) => {
          // Check if any gateway is connected
          const gateways = d.gateways ?? [];
          const hasConnected = gateways.some((g: { status: string }) => g.status === "connected");
          const hasReconnecting = gateways.some((g: { status: string }) => g.status === "reconnecting");
          dispatch({
            type: "STATUS",
            status: hasConnected ? "connected" : hasReconnecting ? "reconnecting" : "disconnected",
          });
        })
        .catch(() => {
          dispatch({ type: "STATUS", status: "disconnected" });
        });
    };

    es.onerror = () => {
      dispatch({ type: "STATUS", status: "disconnected" });
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as GatewayEvent;

        subscribersRef.current.forEach((callback) => {
          try {
            callback(data);
          } catch {
            subscribersRef.current.delete(callback);
          }
        });

        if (data.type === "connected") {
          dispatch({ type: "STATUS", status: "connected" });
        } else if (data.type === "disconnected") {
          dispatch({ type: "STATUS", status: "disconnected" });
        } else if (data.type === "s.event") {
          const payload = data.payload as Record<string, unknown>;
          dispatch({ type: "EVENT", event: data });

          if (payload?.evt === "status") {
            dispatch({
              type: "DEVICE_STATUS",
              did: payload.did as string,
              func: payload.func as number,
              value: (payload.value as number[]) ?? [],
            });
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);

  return { ...state, subscribe };
}
