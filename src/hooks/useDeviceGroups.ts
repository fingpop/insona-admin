"use client";

import { useCallback, useEffect, useState } from "react";
import { Device } from "./useDevices";

// 组设备类型（包含 displayId）
export interface GroupDevice extends Device {
  displayId?: string;  // 显示用的原始 DID
}

export function useDeviceGroups(filters?: { meshId?: string; alive?: number }) {
  const [groups, setGroups] = useState<GroupDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.meshId) params.set("meshId", filters.meshId);
      if (filters?.alive !== undefined) params.set("alive", String(filters.alive));

      const url = params.toString()
        ? `/api/devices/groups?${params.toString()}`
        : "/api/devices/groups";
      const res = await fetch(url);
      const data = await res.json();
      setGroups(data.devices ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取组设备失败");
    } finally {
      setLoading(false);
    }
  }, [filters?.meshId, filters?.alive]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const controlGroup = useCallback(
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

  const updateGroup = useCallback(
    async (id: string, updates: Partial<Pick<Device, "name" | "roomId" | "ratedPower">>) => {
      // 组设备的存储 ID 是 meshId:did 格式，直接用 id 更新
      const res = await fetch(`/api/devices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...data.device } : g)));
      return data.device;
    },
    []
  );

  return { groups, loading, error, refetch: fetchGroups, controlGroup, updateGroup };
}
