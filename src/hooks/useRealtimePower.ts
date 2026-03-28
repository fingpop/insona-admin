import { useEffect, useState } from "react";
import type { RealtimePowerData } from "@/lib/types";

interface RealtimePower {
  data: RealtimePowerData[];
  current: number;
  average: number;
  peak: number;
  loading: boolean;
  error: string | null;
}

export function useRealtimePower(intervalSeconds: number = 10) {
  const [power, setPower] = useState<RealtimePower>({
    data: [],
    current: 0,
    average: 0,
    peak: 0,
    loading: true,
    error: null,
  });

  const fetchPower = async () => {
    try {
      const res = await fetch("/api/dashboard/realtime-power?lastMinutes=60");
      const data = await res.json();

      setPower({
        data: data.data || [],
        current: data.current || 0,
        average: data.average || 0,
        peak: data.peak || 0,
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error("Realtime power fetch error:", err);
      setPower((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "获取功率数据失败",
      }));
    }
  };

  // 初始加载
  useEffect(() => {
    fetchPower();
  }, []);

  // 定时轮询
  useEffect(() => {
    if (intervalSeconds <= 0) return;

    const timer = setInterval(fetchPower, intervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [intervalSeconds]);

  return { power, refetch: fetchPower };
}