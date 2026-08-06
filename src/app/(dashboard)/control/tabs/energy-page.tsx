"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { getLocalDateOffset } from "@/lib/utils";
import { DbDevice, SpaceNode } from "../types";
import { EnergyChart, EnergyBarChart, TodayEnergyHourlyChart, TodayEnergyRoomChart } from "../energy-charts";

// ==================== 常量 ====================
// 碳排放系数 (中国平均电网排放因子, 2024年数据)
const CARBON_EMISSION_FACTOR = 0.5586; // kgCO₂e/kWh

// ==================== 能耗分析页面 ====================
export default function EnergyPage({ dbDevices, spaces }: { dbDevices: DbDevice[]; spaces: SpaceNode[] }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(30);
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [todayChartType, setTodayChartType] = useState<"hourly" | "room">("hourly"); // 今日能耗图表类型
  const [energyData, setEnergyData] = useState<{
    records: { deviceId: string; date: string; kwh: number; device: { name: string; room?: { name: string } } }[];
    totals: { kwh: number; carbonEmission: number };
    dailyTotals: { date: string; _sum: { kwh: number | null } }[];
  } | null>(null);
  const [todayEnergy, setTodayEnergy] = useState<{
    date: string;
    totalKwh: number;
    totalCarbonEmission: number;
    recordCount: number;
    deviceStats: any[];
    roomStats: any[];
    hourlyData: any[];
    latestData: any[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);

  // 获取查询日期范围
  const getDateRange = () => {
    const to = getLocalDateOffset(0);
    const from = getLocalDateOffset(-period);
    return { from, to };
  };

  // 加载能耗数据
  const loadEnergyData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange();
      let url = `/api/energy?from=${from}&to=${to}`;
      if (selectedRoom) {
        url += `&roomId=${selectedRoom}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setEnergyData(data);
    } catch (err) {
      console.error("加载能耗数据失败:", err);
    } finally {
      setLoading(false);
    }
  }, [period, selectedRoom]);

  // 加载今日能耗数据
  const loadTodayEnergy = useCallback(async () => {
    setTodayLoading(true);
    try {
      let url = "/api/energy/today";
      if (selectedRoom) {
        url += `?roomId=${selectedRoom}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setTodayEnergy(data);
    } catch (err) {
      console.error("加载今日能耗数据失败:", err);
    } finally {
      setTodayLoading(false);
    }
  }, [selectedRoom]);

  useEffect(() => {
    loadEnergyData();
    loadTodayEnergy();
  }, [loadEnergyData, loadTodayEnergy]);

  // 处理每日数据
  const dailyData = energyData?.dailyTotals?.map((d) => ({
    date: d.date.slice(5), // MM-DD
    value: d._sum.kwh ?? 0,
    carbonEmission: (d._sum.kwh ?? 0) * CARBON_EMISSION_FACTOR,
  })) ?? [];

  // 计算总能耗和总碳排放
  const totalKwh = energyData?.totals?.kwh ?? 0;
  const totalCarbonEmission = energyData?.totals?.carbonEmission ?? 0;
  const avgKwh = dailyData.length > 0 ? totalKwh / dailyData.length : 0;
  const avgCarbonEmission = dailyData.length > 0 ? totalCarbonEmission / dailyData.length : 0;

  // 按房间分组的能耗数据
  const roomEnergyData = useMemo(() => {
    if (!energyData?.records) return {};
    const grouped: Record<string, number> = {};
    for (const record of energyData.records) {
      const roomName = record.device.room?.name || t("devices.notBound");
      grouped[roomName] = (grouped[roomName] || 0) + record.kwh;
    }
    return grouped;
  }, [energyData?.records]);

  // 获取所有房间列表
  const flattenRooms = (nodes: SpaceNode[]): SpaceNode[] => {
    const result: SpaceNode[] = [];
    const flatten = (nodeList: SpaceNode[]) => {
      for (const node of nodeList) {
        if (node.type === "room") result.push(node);
        if (node.children) flatten(node.children);
      }
    };
    flatten(nodes);
    return result;
  };

  const roomList = flattenRooms(spaces);

  return (
    <div className="fade-in">
      {/* 今日能耗统计卡片 */}
      {todayEnergy && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
          <div className="stat-card">
            <p className="text-sm text-blue-200 mb-1">{t("energy.todayTotalKwh")}</p>
            <h3 className="text-3xl font-bold text-white">{todayEnergy.totalKwh.toFixed(4)}</h3>
            <p className="text-xs text-gray-400 mt-2">
              {t("energy.recordsCount", { count: todayEnergy.recordCount })}
            </p>
          </div>
          <div className="stat-card" style={{ background: "linear-gradient(135deg, #059669 0%, #047857 100%)" }}>
            <p className="text-sm text-green-200 mb-1">{t("energy.todayCarbon")}</p>
            <h3 className="text-3xl font-bold text-white">{todayEnergy.totalCarbonEmission.toFixed(4)}</h3>
            <p className="text-xs text-gray-400 mt-2">
              {t("energy.efLabel", { value: CARBON_EMISSION_FACTOR })}
            </p>
          </div>
          <div className="stat-card" style={{ background: "linear-gradient(135deg, #0891b2 0%, #0e7490 100%)" }}>
            <p className="text-sm text-cyan-200 mb-1">{t("energy.activeDevices")}</p>
            <h3 className="text-3xl font-bold text-white">{todayEnergy.deviceStats.length}</h3>
            <p className="text-xs text-gray-400 mt-2">
              {t("energy.spacesCount", { count: todayEnergy.roomStats.length })}
            </p>
          </div>
          <div className="stat-card" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)" }}>
            <p className="text-sm text-purple-200 mb-1">{t("energy.totalKwhLabel")}</p>
            <h3 className="text-3xl font-bold text-white">{totalKwh.toFixed(2)}</h3>
            <p className="text-xs text-gray-400 mt-2">{t("energy.historicalTotal")}</p>
          </div>
          <div className="stat-card" style={{ background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" }}>
            <p className="text-sm text-red-200 mb-1">{t("energy.totalCarbonLabel")}</p>
            <h3 className="text-3xl font-bold text-white">{totalCarbonEmission.toFixed(2)}</h3>
            <p className="text-xs text-gray-400 mt-2">{t("energy.dailyAverageLabel", { value: avgCarbonEmission.toFixed(2) })}</p>
          </div>
        </div>
      )}

      {/* 今日能耗趋势 */}
      {todayEnergy && (
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-white">{t("energy.todayTrend")}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTodayChartType("hourly")}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  todayChartType === "hourly"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <i className="fas fa-clock mr-2"></i>
                {t("energy.hourlyTrend")}
              </button>
              <button
                onClick={() => setTodayChartType("room")}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  todayChartType === "room"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                <i className="fas fa-building mr-2"></i>
                {t("energy.spaceComparison")}
              </button>
            </div>
          </div>

          <div style={{ height: "300px" }}>
            {todayChartType === "hourly" && todayEnergy.hourlyData && (
              <TodayEnergyHourlyChart data={todayEnergy.hourlyData} />
            )}

            {todayChartType === "room" && todayEnergy.roomStats && (
              <TodayEnergyRoomChart data={todayEnergy.roomStats.sort((a: any, b: any) => b.totalKwh - a.totalKwh)} />
            )}
          </div>

          {/* 图表说明 */}
          {todayChartType === "hourly" && (
            <p className="text-xs text-gray-500 mt-4 text-center">
              {t("energy.hourlyTrendDesc")}
            </p>
          )}
          {todayChartType === "room" && (
            <p className="text-xs text-gray-500 mt-4 text-center">
              {t("energy.spaceComparisonDesc")}
            </p>
          )}
        </div>
      )}

      {/* 筛选条件 */}
      <div className="card mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">{t("energy.timeRange")}</label>
            <select
              className="input-field text-sm"
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
            >
              <option value={7}>{t("energy.week")}</option>
              <option value={30}>{t("energy.month")}</option>
              <option value={90}>{t("energy.quarter")}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">{t("energy.spaceLabel")}</label>
            <select
              className="input-field text-sm"
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
            >
              <option value="">{t("energy.allSpaces")}</option>
              {roomList.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
          </div>
          <button onClick={loadEnergyData} className="btn btn-secondary text-sm" disabled={loading}>
            <i className={`fas fa-sync-alt ${loading ? "animate-spin" : ""}`}></i>
            <span>{t("common.refresh")}</span>
          </button>
        </div>
      </div>

      {/* 总能耗趋势图 */}
      <div className="card mb-6">
        <h3 className="text-lg font-bold text-white mb-6">{t("energy.totalTrend")}</h3>
        {dailyData.length > 0 ? (
          <EnergyChart data={dailyData} />
        ) : (
          <p className="text-center text-gray-400 py-12">{t("dashboard.noData")}</p>
        )}
      </div>

      {/* 各空间能耗分析 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold text-white mb-6">{t("energy.spacePercentage")}</h3>
          {Object.keys(roomEnergyData).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(roomEnergyData)
                .sort((a, b) => b[1] - a[1])
                .map(([room, kwh]) => {
                  const percent = totalKwh > 0 ? (kwh / totalKwh * 100) : 0;
                  return (
                    <div key={room}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-gray-300">{room}</span>
                        <span className="text-sm text-white font-medium">{kwh.toFixed(2)} kWh ({percent.toFixed(1)}%)</span>
                      </div>
                      <div className="progress-bar">
                        <div
                          className="progress-fill"
                          style={{ width: `${percent}%`, background: "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)" }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-8">{t("dashboard.noData")}</p>
          )}
        </div>

        <div className="card">
          <h3 className="text-lg font-bold text-white mb-6">{t("energy.spaceComparisonChart")}</h3>
          {Object.keys(roomEnergyData).length > 0 ? (
            <EnergyBarChart data={Object.entries(roomEnergyData).map(([name, value]) => ({ name, value }))} />
          ) : (
            <p className="text-center text-gray-400 py-8">{t("dashboard.noData")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
