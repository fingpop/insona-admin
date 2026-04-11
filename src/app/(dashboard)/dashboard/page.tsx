"use client";

import { useEffect, useState } from "react";
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
  LineChart,
  Line,
  LabelList,
} from "recharts";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useGatewayEvents } from "@/hooks/useGatewayEvents";

type DateRange = "today" | "7d" | "30d";

const COLORS = ["#3b9eff", "#4ade80", "#fbbf24", "#f87171", "#a78bfa", "#2dd4bf"];

export default function DashboardPage() {
  const { status, subscribe } = useGatewayEvents();
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [autoRefresh, setAutoRefresh] = useState(0); // 自动刷新间隔（秒），0=关闭
  const [recentEvents, setRecentEvents] = useState<Array<{ id: string; timestamp: string; type: string; message: string; deviceName?: string }>>([]);

  const { data, refetch } = useDashboardData({
    from: dateRange === "today" ? new Date().toISOString().split("T")[0] :
          dateRange === "7d" ? new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0] :
          new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });

  // 自动刷新
  useEffect(() => {
    if (autoRefresh <= 0) return;
    const timer = setInterval(() => refetch(), autoRefresh * 1000);
    return () => clearInterval(timer);
  }, [autoRefresh, refetch]);

  // 订阅实时事件
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === "s.event") {
        const payload = event.payload as Record<string, unknown>;
        const evt = payload.evt as string;
        const did = payload.did as string | undefined;

        // 只处理状态变化事件
        if (evt === "status" || evt === "switch.key" || evt === "scene.recall") {
          const newEvent = {
            id: `${Date.now()}-${Math.random()}`,
            timestamp: new Date().toLocaleTimeString("zh-CN"),
            type: evt === "status" ? "状态变化" : evt === "switch.key" ? "面板按键" : "场景联动",
            message: `${did || "未知设备"} ${evt === "status" ? "状态变化" : evt === "switch.key" ? "按键触发" : "场景执行"}`,
            deviceName: did,
          };
          setRecentEvents(prev => [newEvent, ...prev].slice(0, 10));
        }
      } else if (event.type === "connected") {
        const newEvent = {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString("zh-CN"),
          type: "连接",
          message: "网关已连接",
        };
        setRecentEvents(prev => [newEvent, ...prev].slice(0, 10));
      } else if (event.type === "disconnected") {
        const newEvent = {
          id: `${Date.now()}-${Math.random()}`,
          timestamp: new Date().toLocaleTimeString("zh-CN"),
          type: "断开",
          message: "网关已断开",
        };
        setRecentEvents(prev => [newEvent, ...prev].slice(0, 10));
      }
    });
    return unsubscribe;
  }, [subscribe]);

  return (
    <div className="h-screen w-screen bg-[#0a0f1a] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-6 py-4 border-b border-[#1c2630] bg-[#0d1520]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-white">数据大盘</h1>
            <div className="flex items-center gap-2 text-sm text-[#8a9baf]">
              <span className={`w-2 h-2 rounded-full ${
                status === "connected" ? "bg-green-500" :
                status === "reconnecting" ? "bg-yellow-500" : "bg-red-500"
              }`} />
              <span>{status === "connected" ? "网关在线" : status === "reconnecting" ? "连接中..." : "网关离线"}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              {[
                { label: "今日", value: "today" },
                { label: "近 7 天", value: "7d" },
                { label: "近 30 天", value: "30d" },
              ].map((o) => (
                <button
                  key={o.value}
                  onClick={() => setDateRange(o.value as DateRange)}
                  className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                    dateRange === o.value
                      ? "bg-[#137fec]/20 border-[#137fec] text-[#3b9eff]"
                      : "bg-[#101922] border-[#1c2630] text-[#8a9baf] hover:text-white"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <select
              value={autoRefresh}
              onChange={(e) => setAutoRefresh(Number(e.target.value))}
              className="px-3 py-1.5 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-xs rounded-md border border-[#1c2630] focus:outline-none focus:border-[#3b9eff]"
            >
              <option value={0}>刷新：关闭</option>
              <option value={30}>30 秒</option>
              <option value={60}>1 分钟</option>
              <option value={300}>5 分钟</option>
            </select>
            <button
              onClick={() => refetch()}
              disabled={data.loading}
              className="px-4 py-1.5 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-xs rounded-md disabled:opacity-50 transition-colors"
            >
              刷新
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-hidden">
        <div className="h-full flex flex-col gap-4">
          {/* Row 1: Stats Cards - Fixed height */}
          <div className="flex-shrink-0 grid grid-cols-6 gap-4" style={{ height: "120px" }}>
            {data.stats && (
              <>
                <StatCard label="设备总数" value={data.stats.totalDevices} sub={`在线率 ${(data.stats.onlineRate * 100).toFixed(0)}%`} color="text-[#3b9eff]" />
                <StatCard label="在线设备" value={data.stats.onlineDevices} sub={`离线 ${data.stats.offlineDevices}`} color="text-green-400" />
                <StatCard label="今日能耗" value={`${data.stats.todayKwh.toFixed(2)} kWh`} sub={`环比 ${(data.stats.energyGrowthRate * 100).toFixed(1)}%`} color="text-yellow-400" />
                <StatCard label="峰值功率" value={`${data.stats.todayPeakWatts.toFixed(0)} W`} sub="今日峰值" color="text-red-400" />
              </>
            )}
            {data.carbonEmissions && (
              <>
                <StatCard label="碳排放" value={`${data.carbonEmissions.totalCarbon.toFixed(2)} kg`} sub="CO₂当量" color="text-cyan-400" />
                <StatCard label="等效植树" value={data.carbonEmissions.treesNeeded.toFixed(1)} sub="棵/年" color="text-emerald-400" />
              </>
            )}
          </div>

          {/* Row 2: Charts - Left: Energy Trend, Right: Device Type - Fixed height */}
          <div className="flex-shrink-0 grid grid-cols-3 gap-4" style={{ height: "300px" }}>
            {/* Energy Trend - Wide - 使用今日能耗数据 */}
            <div className="col-span-2 bg-[#101922] rounded-lg border border-[#1c2630] p-4 flex flex-col" style={{ minHeight: 0 }}>
              <h2 className="text-sm font-medium text-white mb-2 flex-shrink-0">今日能耗趋势</h2>
              <div className="flex-1 min-h-0">
                {data.todayEnergy?.hourlyData && data.todayEnergy.hourlyData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.todayEnergy.hourlyData}>
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
              <p className="text-xs text-[#4a5b70] mt-2 flex-shrink-0">
                24 小时能耗分布趋势，展示每小时的累计能耗
              </p>
            </div>

            {/* Device Type Distribution - 只显示灯具、面板、开合帘、传感器 */}
            <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4 flex flex-col" style={{ minHeight: 0 }}>
              <h2 className="text-sm font-medium text-white mb-2 flex-shrink-0">设备分布</h2>
              <div className="flex-1 min-h-0">
                {data.deviceTypeDistribution?.distribution ? (
                  (() => {
                    // 过滤只显示灯具 (1984)、面板 (1218)、开合帘 (1860/1862)、传感器 (1344)
                    const filteredData = data.deviceTypeDistribution!.distribution.filter(
                      (d) => d.type === 1984 || d.type === 1218 || d.type === 1860 || d.type === 1862 || d.type === 1344
                    );
                    // 合并开合帘数据
                    const curtainData = filteredData.filter((d) => d.type === 1860 || d.type === 1862);
                    const curtainTotal = curtainData.reduce((sum, d) => sum + d.count, 0);
                    const otherData = filteredData.filter((d) => d.type !== 1860 && d.type !== 1862);
                    const finalData = curtainTotal > 0
                      ? [...otherData, { type: 1860, label: "开合帘", count: curtainTotal, online: 0, percentage: 0 }]
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
                            outerRadius={60}
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

          {/* Row 3: Bottom Row - Ranking, Realtime Power, Events - Fill remaining space */}
          <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
            {/* Room Energy Ranking */}
            <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4 flex flex-col" style={{ minHeight: 0 }}>
              <h2 className="text-sm font-medium text-white mb-2 flex-shrink-0">能耗排行</h2>
              <div className="flex-1 min-h-0">
                {data.roomEnergyRanking?.ranking && data.roomEnergyRanking.ranking.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.roomEnergyRanking.ranking.slice(0, 5)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                      <XAxis type="number" stroke="#4a5b70" fontSize={10} tickFormatter={(v) => `${v}`} />
                      <YAxis dataKey="roomName" type="category" stroke="#4a5b70" fontSize={10} width={60} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#0d1520", border: "1px solid #1c2630", borderRadius: "8px" }}
                        formatter={(value: number) => [`${value.toFixed(2)} kWh`, "能耗"]}
                      />
                      <Bar dataKey="kwh" fill="#3b9eff">
                        <LabelList dataKey="kwh" position="right" formatter={(v: number) => `${v.toFixed(1)} kWh`} fontSize={10} fill="#8a9baf" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-[#4a5b70]">暂无数据</div>
                )}
              </div>
            </div>

            {/* Total Energy Trend - 总能耗趋势 */}
            <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4 flex flex-col" style={{ minHeight: 0 }}>
              <h2 className="text-sm font-medium text-white mb-2 flex-shrink-0">总能耗趋势</h2>
              <div className="flex-1 min-h-0">
                {data.energyTrend && data.energyTrend.length > 0 ? (
                  <div className="h-full flex items-end justify-between gap-1 px-2 pb-6 relative">
                    {data.energyTrend.map((item, index) => {
                      const maxValue = Math.max(...(data.energyTrend ?? []).map((d) => d.value));
                      // 使用最大值的比例计算高度，而不是相对范围
                      const height = maxValue > 0 ? (item.value / maxValue) * 100 : 0;
                      const barHeight = Math.max(height, 3); // 最小 3% 高度，保证可见
                      return (
                        <div key={index} className="flex-1 flex flex-col justify-end h-full relative group">
                          {/* 数值标签 - 根据柱子高度动态调整位置 */}
                          <div
                            className="absolute left-0 right-0 flex justify-center transition-all duration-300"
                            style={{
                              bottom: `${barHeight}%`,
                              transform: `translateY(-100%)`
                            }}
                          >
                            {item.value > 0 && (
                              <span className="text-[10px] text-[#3b9eff] font-medium leading-none whitespace-nowrap">
                                {item.value.toFixed(1)}
                              </span>
                            )}
                          </div>
                          {/* 柱子 */}
                          <div
                            className="w-full bg-gradient-to-t from-[#137fec] to-[#3b9eff] rounded-t transition-all duration-300 hover:from-[#1a8fff] hover:to-[#4dabff]"
                            style={{ height: `${barHeight}%` }}
                            title={`${item.date}: ${item.value.toFixed(3)} kWh`}
                          />
                          {/* 日期标签 - 绝对定位在底部 */}
                          <div className="absolute -bottom-5 left-0 right-0 flex justify-center">
                            <span className="text-[9px] text-[#4a5b70]">{item.date.split("-").slice(1).join("-")}</span>
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

            {/* Recent Events - 实时事件 */}
            <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4 flex flex-col" style={{ minHeight: 0 }}>
              <h2 className="text-sm font-medium text-white mb-2 flex-shrink-0">最近事件</h2>
              <div className="flex-1 min-h-0 overflow-y-auto">
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
      </main>
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
