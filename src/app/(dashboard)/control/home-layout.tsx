"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
  LabelList,
} from "recharts";

type DateRange = "today" | "7d" | "30d";

const COLORS = ["#3b9eff", "#4ade80", "#fbbf24", "#f87171", "#a78bfa", "#2dd4bf"];

// 类型定义
interface Scene {
  id: string;
  name: string;
  icon: string;
  color: string;
  showInQuick: boolean;
  sceneId?: number;
  meshId?: string;
}

interface RoomStatus {
  roomId: string;
  roomName: string;
  deviceCount: number;
  onlineCount: number;
}

interface DashboardEvent {
  id: string;
  timestamp: string;
  type: string;
  message: string;
}

interface Stats {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  onlineRate: number;
  todayKwh: number;
  todayPeakWatts: number;
  energyGrowthRate: number;
}

interface CarbonEmissions {
  totalCarbon: number;
  treesNeeded: number;
}

interface HourlyEnergy {
  hour: string;
  kwh: number;
}

interface DeviceTypeDist {
  type: number;
  label: string;
  count: number;
  online: number;
}

interface RoomEnergyRanking {
  roomName: string;
  kwh: number;
}

interface EnergyTrendData {
  date: string;
  value: number;
}

interface HomeLayoutProps {
  gatewayStatus: "connected" | "disconnected" | "connecting";
  gatewayIP: string;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  currentLang: string;
  onLangChange: (lang: string) => void;
}

export default function HomeLayout({ gatewayStatus, gatewayIP, onConnect, onDisconnect, currentLang, onLangChange }: HomeLayoutProps) {
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [roomStatuses, setRoomStatuses] = useState<RoomStatus[]>([]);
  const [recentEvents, setRecentEvents] = useState<DashboardEvent[]>([]);

  // 统计数据
  const [stats, setStats] = useState<Stats | null>(null);
  const [carbonEmissions, setCarbonEmissions] = useState<CarbonEmissions | null>(null);
  const [hourlyEnergy, setHourlyEnergy] = useState<HourlyEnergy[]>([]);
  const [deviceTypeDist, setDeviceTypeDist] = useState<DeviceTypeDist[]>([]);
  const [roomEnergyRanking, setRoomEnergyRanking] = useState<RoomEnergyRanking[]>([]);
  const [energyTrend, setEnergyTrend] = useState<EnergyTrendData[]>([]);

  // 加载数据
  const fetchData = useCallback(async () => {
    try {
      const [
        statsRes,
        carbonRes,
        hourlyRes,
        deviceTypeRes,
        rankingRes,
        energyRes,
        scenesRes,
        roomsRes,
        eventsRes,
      ] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch(`/api/dashboard/carbon-emissions?range=${dateRange === "today" ? "today" : "week"}`),
        fetch("/api/dashboard/hourly-energy?date=" + new Date().toISOString().split("T")[0]),
        fetch("/api/dashboard/device-type-distribution"),
        fetch("/api/dashboard/room-energy-ranking"),
        fetch(`/api/energy?from=${new Date(Date.now() - (dateRange === "today" ? 0 : dateRange === "7d" ? 6 : 29) * 86400000).toISOString().split("T")[0]}&to=${new Date().toISOString().split("T")[0]}`),
        fetch("/api/scenes?quick=true"),
        fetch("/api/dashboard/floor-status"),
        fetch("/api/dashboard/events?limit=10"),
      ]);

      const statsData = await statsRes.json();
      const carbonData = await carbonRes.json();
      const hourlyData = await hourlyRes.json();
      const deviceTypeData = await deviceTypeRes.json();
      const rankingData = await rankingRes.json();
      const energyData = await energyRes.json();
      const scenesData = await scenesRes.json();
      const roomsData = await roomsRes.json();
      const eventsData = await eventsRes.json();

      setStats(statsData);
      setCarbonEmissions(carbonData);
      setHourlyEnergy(hourlyData?.hourlyData ?? []);
      setDeviceTypeDist(deviceTypeData?.distribution ?? []);
      setRoomEnergyRanking(rankingData?.ranking ?? []);
      setScenes(scenesData?.scenes?.filter((s: Scene) => s.showInQuick) ?? []);

      // 处理能耗趋势
      const trendData = energyData?.dailyTotals?.map((d: { date: string; _sum: { kwh: number | null } }) => ({
        date: d.date.slice(5),
        value: d._sum.kwh ?? 0,
      })) ?? [];
      setEnergyTrend(trendData);

      // 处理房间状态
      if (roomsData?.floors?.length > 0) {
        const rooms: RoomStatus[] = [];
        roomsData.floors.forEach((floor: any) => {
          floor.rooms?.forEach((room: any) => {
            rooms.push({
              roomId: room.roomId,
              roomName: room.roomName,
              deviceCount: room.deviceCount,
              onlineCount: room.onlineCount,
            });
          });
        });
        setRoomStatuses(rooms.filter((r: RoomStatus) => r.deviceCount > 0).slice(0, 12));
      } else if (roomsData?.rooms) {
        // 没有楼层结构时，直接使用房间
        setRoomStatuses(
          roomsData.rooms
            .filter((r: any) => r.deviceCount > 0)
            .slice(0, 12)
            .map((r: any) => ({
              roomId: r.roomId,
              roomName: r.roomName,
              deviceCount: r.deviceCount,
              onlineCount: r.onlineCount,
            }))
        );
      }

      // 设置初始事件
      if (eventsData?.events) {
        setRecentEvents(eventsData.events.slice(0, 10));
      }
    } catch (err) {
      console.error("Fetch data error:", err);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 自动刷新
  useEffect(() => {
    if (autoRefresh <= 0) return;
    const timer = setInterval(fetchData, autoRefresh * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchData]);

  // 激活场景
  const activateScene = async (scene: Scene) => {
    try {
      // 调用场景激活 API（使用场景数据库 ID）
      await fetch(`/api/scenes/${scene.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Activate scene error:", err);
    }
  };

  const languages = [
    { code: "zh-CN", name: "简体中文" },
    { code: "en-US", name: "English" },
  ];

  return (
    <div className="space-y-4">
      {/* 快捷场景栏 */}
      {scenes.length > 0 && (
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4">
          <h2 className="text-sm font-medium text-white mb-3">快捷场景</h2>
          <div className="flex gap-3 flex-wrap">
            {scenes.map((scene) => (
              <button
                key={scene.id}
                onClick={() => activateScene(scene)}
                className="px-4 py-2 rounded-lg border border-[#1c2630] hover:border-[#3b9eff] hover:bg-[#137fec]/20 transition-colors flex items-center gap-2"
                style={{ borderColor: scene.color }}
              >
                <i className={`fas ${scene.icon}`} style={{ color: scene.color }} />
                <span className="text-sm text-white">{scene.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Row 1: KPI 统计卡片 */}
      <div className="grid grid-cols-6 gap-4">
        {stats && (
          <>
            <StatCard
              label="设备总数"
              value={stats.totalDevices}
              sub={`在线率 ${(stats.onlineRate * 100).toFixed(0)}%`}
              color="text-[#3b9eff]"
            />
            <StatCard
              label="在线设备"
              value={stats.onlineDevices}
              sub={`离线 ${stats.offlineDevices}`}
              color="text-green-400"
            />
            <StatCard
              label="今日能耗"
              value={`${stats.todayKwh.toFixed(2)} kWh`}
              sub={`环比 ${(stats.energyGrowthRate * 100).toFixed(1)}%`}
              color="text-yellow-400"
            />
            <StatCard
              label="峰值功率"
              value={`${stats.todayPeakWatts.toFixed(0)} W`}
              sub="今日峰值"
              color="text-red-400"
            />
          </>
        )}
        {carbonEmissions && (
          <>
            <StatCard
              label="碳排放"
              value={`${carbonEmissions.totalCarbon.toFixed(2)} kg`}
              sub="CO₂当量"
              color="text-cyan-400"
            />
            <StatCard
              label="等效植树"
              value={carbonEmissions.treesNeeded.toFixed(1)}
              sub="棵/年"
              color="text-emerald-400"
            />
          </>
        )}
      </div>

      {/* Row 2: 空间状态卡片 */}
      {roomStatuses.length > 0 && (
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4">
          <h2 className="text-sm font-medium text-white mb-3">空间状态</h2>
          <div className="grid grid-cols-6 gap-3">
            {roomStatuses.map((room) => (
              <div
                key={room.roomId}
                className="bg-[#0d1520] rounded-lg border border-[#1c2630] p-3 hover:border-[#3b9eff] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white truncate flex-1">{room.roomName}</span>
                  <span className={`w-2 h-2 rounded-full ${room.onlineCount > 0 ? "bg-green-500" : "bg-gray-500"}`} />
                </div>
                <div className="text-xs text-[#4a5b70]">
                  <span className="text-[#8a9baf]">{room.onlineCount}</span> / {room.deviceCount} 设备
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row 3: 核心图表 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 今日能耗趋势 */}
        <div className="col-span-2 bg-[#101922] rounded-lg border border-[#1c2630] p-4">
          <h2 className="text-sm font-medium text-white mb-2">今日能耗趋势</h2>
          <div className="h-[300px]">
            {hourlyEnergy.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyEnergy}>
                  <defs>
                    <linearGradient id="colorToday" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                  <XAxis dataKey="hour" stroke="#4a5b70" fontSize={11} />
                  <YAxis stroke="#4a5b70" fontSize={11} tickFormatter={(v) => `${v}kWh`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0d1520", border: "1px solid #1c2630", borderRadius: "8px" }}
                    labelStyle={{ color: "#8a9baf" }}
                    formatter={(value: number) => [`${value.toFixed(3)} kWh`, "能耗"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="kwh"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#colorToday)"
                    name="能耗 (kWh)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[#4a5b70]">暂无数据</div>
            )}
          </div>
        </div>

        {/* 设备类型分布 */}
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4">
          <h2 className="text-sm font-medium text-white mb-2">设备分布</h2>
          <div className="h-[300px] flex items-center justify-center">
            {deviceTypeDist.length > 0 ? (
              (() => {
                const filteredData = deviceTypeDist.filter(
                  (d) => d.type === 1984 || d.type === 1218 || d.type === 1860 || d.type === 1862 || d.type === 1344
                );
                const curtainData = filteredData.filter((d) => d.type === 1860 || d.type === 1862);
                const curtainTotal = curtainData.reduce((sum, d) => sum + d.count, 0);
                const otherData = filteredData.filter((d) => d.type !== 1860 && d.type !== 1862);
                const finalData = curtainTotal > 0
                  ? [...otherData, { type: 1860, label: "开合帘", count: curtainTotal, online: 0 }]
                  : otherData;

                return (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={finalData}
                        dataKey="count"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {finalData.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#0d1520", border: "1px solid #1c2630", borderRadius: "8px" }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                );
              })()
            ) : (
              <div className="h-full flex items-center justify-center text-[#4a5b70]">暂无数据</div>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: 详情数据 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 房间能耗排行 */}
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4">
          <h2 className="text-sm font-medium text-white mb-2">能耗排行</h2>
          <div className="h-[250px]">
            {roomEnergyRanking.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roomEnergyRanking.slice(0, 5)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                  <XAxis type="number" stroke="#4a5b70" fontSize={10} />
                  <YAxis dataKey="roomName" type="category" stroke="#4a5b70" fontSize={10} width={60} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0d1520", border: "1px solid #1c2630", borderRadius: "8px" }}
                    formatter={(value: number) => [`${value.toFixed(2)} kWh`, "能耗"]}
                  />
                  <Bar dataKey="kwh" fill="#3b9eff">
                    <LabelList dataKey="kwh" position="right" formatter={(v: number) => `${v.toFixed(1)}`} fontSize={10} fill="#8a9baf" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[#4a5b70]">暂无数据</div>
            )}
          </div>
        </div>

        {/* 总能耗趋势 */}
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4">
          <h2 className="text-sm font-medium text-white mb-2">总能耗趋势</h2>
          <div className="h-[250px]">
            {energyTrend.length > 0 ? (
              <div className="h-full flex items-end justify-between gap-1 px-2 pb-6 relative">
                {energyTrend.map((item, index) => {
                  const maxValue = Math.max(...energyTrend.map((d) => d.value));
                  const height = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                  const barHeight = Math.max(height, 3);
                  return (
                    <div key={index} className="flex-1 flex flex-col justify-end h-full relative">
                      <div
                        className="absolute left-0 right-0 flex justify-center"
                        style={{ bottom: `${barHeight}%`, transform: "translateY(-100%)" }}
                      >
                        {item.value > 0 && (
                          <span className="text-[10px] text-[#3b9eff] font-medium leading-none whitespace-nowrap">
                            {item.value.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <div
                        className="w-full bg-gradient-to-t from-[#137fec] to-[#3b9eff] rounded-t transition-all duration-300 hover:from-[#1a8fff] hover:to-[#4dabff]"
                        style={{ height: `${barHeight}%` }}
                      />
                      <div className="absolute -bottom-5 left-0 right-0 flex justify-center">
                        <span className="text-[9px] text-[#4a5b70]">{item.date}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-[#4a5b70]">暂无数据</div>
            )}
          </div>
        </div>

        {/* 最近事件 */}
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4">
          <h2 className="text-sm font-medium text-white mb-2">最近事件</h2>
          <div className="h-[250px] overflow-y-auto">
            {recentEvents.length > 0 ? (
              <div className="space-y-2">
                {recentEvents.slice(0, 10).map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs">
                    <span className="text-[#8a9baf] truncate flex-1" title={e.message}>
                      {e.message}
                    </span>
                    <span className="text-[#4a5b70] ml-2 flex-shrink-0">{e.timestamp}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-[#4a5b70]">
                <div className="text-center">
                  <p className="text-sm">等待事件...</p>
                  <p className="text-xs mt-1">设备状态变化将在此显示</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4 flex flex-col justify-center">
      <p className="text-xs text-[#4a5b70] mb-1">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-[#4a5b70] mt-0.5">{sub}</p>
    </div>
  );
}
