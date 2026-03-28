"use client";

import { useCallback, useEffect, useState } from "react";

export interface Device {
  id: string;
  pid: number;
  type: number;
  alive: number;
  name: string;
  gatewayName: string;
  func: number;
  value: string;
  meshId: string | null;
  roomId: string | null;
  ratedPower: number;
  room?: { id: string; name: string } | null;
  power: number | null;    // 当前功率 (W)
  todayKwh: number | null; // 今日能耗 (kWh)
}

export function useDevices(filters?: { roomId?: string; type?: number; alive?: number }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.roomId) params.set("roomId", filters.roomId);
      if (filters?.type) params.set("type", String(filters.type));
      if (filters?.alive !== undefined) params.set("alive", String(filters.alive));

      const queryString = params.toString();
      const url = queryString ? `/api/devices?${queryString}` : "/api/devices";
      const res = await fetch(url);
      const data = await res.json();
      setDevices(data.devices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch devices");
    } finally {
      setLoading(false);
    }
  }, [filters?.roomId, filters?.type, filters?.alive]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  const syncDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/devices", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDevices(data.devices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const controlDevice = useCallback(
    async (did: string, action: string, value: number[], meshid: string) => {
      const res = await fetch("/api/devices/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ did, action, value, meshid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data;
    },
    []
  );

  const updateDevice = useCallback(
    async (id: string, updates: Partial<Pick<Device, "name" | "roomId" | "ratedPower">>) => {
      const res = await fetch(`/api/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Update local state
      setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...data.device } : d)));
      return data.device;
    },
    []
  );

  return { devices, loading, error, syncDevices, controlDevice, updateDevice, refetch: fetchDevices };
}
