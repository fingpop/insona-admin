"use client";

import { useEffect, useReducer, useRef, useCallback } from "react";

interface GatewayEvent {
  type: string;
  gatewayId?: string;
  payload?: Record<string, unknown>;
  deviceCount?: number;
  message?: string;
}

interface DeviceState {
  [did: string]: { func: number; value: number[] };
}

interface GatewayState {
  status: "connected" | "disconnected" | "connecting" | "reconnecting";
  lastEvent: GatewayEvent | null;
  devices: DeviceState;
  syncStatus: "idle" | "syncing" | "complete" | "failed";
  syncMessage: string;
}

type Action =
  | { type: "STATUS"; status: GatewayState["status"] }
  | { type: "EVENT"; event: GatewayEvent }
  | { type: "DEVICE_STATUS"; did: string; func: number; value: number[] }
  | { type: "SYNC_STATUS"; syncStatus: GatewayState["syncStatus"]; syncMessage: string };

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
    case "SYNC_STATUS":
      return { ...state, syncStatus: action.syncStatus, syncMessage: action.syncMessage };
    default:
      return state;
  }
}

const initialState: GatewayState = {
  status: "disconnected",
  lastEvent: null,
  devices: {},
  syncStatus: "idle",
  syncMessage: "",
};

type EventCallback = (event: GatewayEvent) => void;

export function useGatewayEvents() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const esRef = useRef<EventSource | null>(null);
  const subscribersRef = useRef<Set<EventCallback>>(new Set());

  const refreshGatewayStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/gateway/status");
      const data = await response.json();
      const gateways = data.gateways ?? [];
      const hasConnected = gateways.some((g: { status: string }) => g.status === "connected");
      const hasPendingConnection = gateways.some(
        (g: { status: string }) => g.status === "reconnecting" || g.status === "connecting"
      );

      dispatch({
        type: "STATUS",
        status: hasConnected ? "connected" : hasPendingConnection ? "reconnecting" : "disconnected",
      });
    } catch {
      dispatch({ type: "STATUS", status: "disconnected" });
    }
  }, []);

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
      refreshGatewayStatus();
    };

    es.onerror = () => {
      // Don't blindly set disconnected — the actual gateway status is managed
      // by es.onopen (initial fetch) and es.onmessage (real SSE events).
      // es.onerror fires for transient glitches, dev hot-reload, etc.
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

        if (data.type === "connected" || data.type === "disconnected") {
          refreshGatewayStatus().catch(() => {});
        } else if (data.type === "sync_complete") {
          dispatch({
            type: "SYNC_STATUS",
            syncStatus: "complete",
            syncMessage: `设备同步完成，共 ${data.deviceCount ?? 0} 个设备`,
          });
          // 5秒后清除同步状态
          setTimeout(() => {
            dispatch({ type: "SYNC_STATUS", syncStatus: "idle", syncMessage: "" });
          }, 5000);
        } else if (data.type === "sync_failed") {
          dispatch({
            type: "SYNC_STATUS",
            syncStatus: "failed",
            syncMessage: data.message || "设备同步失败，请手动刷新",
          });
          // 失败提示保留10秒
          setTimeout(() => {
            dispatch({ type: "SYNC_STATUS", syncStatus: "idle", syncMessage: "" });
          }, 10000);
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
  }, [refreshGatewayStatus]);

  return { ...state, subscribe };
}
