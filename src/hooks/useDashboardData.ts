import { useEffect, useState, useCallback } from "react";
import type {
  DashboardStats,
  DeviceTypeDistribution,
  FloorStatus,
  FunctionDistribution,
  RoomEnergyRanking,
  HourlyEnergyData,
  DashboardEvent,
} from "@/lib/types";

interface DashboardData {
  stats: DashboardStats | null;
  hourlyEnergy: { hourlyData: HourlyEnergyData[]; total: number } | null;
  deviceTypeDistribution: { distribution: DeviceTypeDistribution[]; total: number } | null;
  roomEnergyRanking: { ranking: RoomEnergyRanking[] } | null;
  floorStatus: { floors: FloorStatus[] } | null;
  functionDistribution: { radarData: FunctionDistribution[] } | null;
  events: { events: DashboardEvent[] } | null;
  loading: boolean;
  error: string | null;
}

export function useDashboardData(dateRange: { from: string; to: string }) {
  const [data, setData] = useState<DashboardData>({
    stats: null,
    hourlyEnergy: null,
    deviceTypeDistribution: null,
    roomEnergyRanking: null,
    floorStatus: null,
    functionDistribution: null,
    events: null,
    loading: true,
    error: null,
  });

  const fetchData = useCallback(async () => {
    setData((prev) => ({ ...prev, loading: true, error: null }));

    try {
      // 并发请求所有 API
      const [
        statsRes,
        hourlyEnergyRes,
        distributionRes,
        rankingRes,
        floorRes,
        functionRes,
        eventsRes,
      ] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch(`/api/dashboard/hourly-energy?date=${dateRange.to}`),
        fetch("/api/dashboard/device-type-distribution"),
        fetch(`/api/dashboard/room-energy-ranking?from=${dateRange.from}&to=${dateRange.to}`),
        fetch("/api/dashboard/floor-status"),
        fetch("/api/dashboard/function-distribution"),
        fetch("/api/dashboard/events?limit=20"),
      ]);

      // 解析响应
      const stats = await statsRes.json();
      const hourlyEnergy = await hourlyEnergyRes.json();
      const distribution = await distributionRes.json();
      const ranking = await rankingRes.json();
      const floor = await floorRes.json();
      const functionData = await functionRes.json();
      const events = await eventsRes.json();

      setData({
        stats,
        hourlyEnergy,
        deviceTypeDistribution: distribution,
        roomEnergyRanking: ranking,
        floorStatus: floor,
        functionDistribution: functionData,
        events,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error("Dashboard data fetch error:", err);
      setData((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "获取数据失败",
      }));
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, refetch: fetchData };
}