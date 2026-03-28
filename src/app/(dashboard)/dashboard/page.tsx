"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
} from "recharts";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useRealtimePower } from "@/hooks/useRealtimePower";
import { useGatewayEvents } from "@/hooks/useGatewayEvents";
import { FUNC_LABELS } from "@/lib/types";

type DateRange = "today" | "7d" | "30d" | "custom";

function getDateStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const COLORS = ["#3b9eff", "#4ade80", "#fbbf24", "#f87171", "#a78bfa", "#2dd4bf"];

export default function DashboardPage() {
  const { status } = useGatewayEvents();
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [customFrom, setCustomFrom] = useState(getDateStr(-7));
  const [customTo, setCustomTo] = useState(getDateStr(0));
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [exporting, setExporting] = useState(false);

  // 计算时间范围
  const getDateParams = () => {
    const to = getDateStr(0);
    let from: string;
    switch (dateRange) {
      case "today":
        from = getDateStr(0);
        break;
      case "7d":
        from = getDateStr(-7);
        break;
      case "30d":
        from = getDateStr(-30);
        break;
      case "custom":
        from = customFrom;
        break;
      default:
        from = getDateStr(-7);
    }
    return { from, to };
  };

  const { data, refetch } = useDashboardData(getDateParams());
  const { power } = useRealtimePower(refreshInterval > 0 ? refreshInterval : 10);

  // 导出CSV
  const exportCSV = () => {
    setExporting(true);
    // 从能耗数据生成CSV
    const headers = ["时间", "能耗(kWh)", "峰值功率(W)"];
    const rows = data.hourlyEnergy?.hourlyData.map((d) => [d.hour, d.kwh.toFixed(3), d.peakWatts.toFixed(1)]) || [];
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard_${getDateStr(0)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">数据大盘</h1>
        <GatewayStatus status={status} />
      </div>

      {/* Toolbar */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Time Range */}
          <div>
            <label className="block text-xs text-[#4a5b70] mb-1">时间范围</label>
            <div className="flex gap-1">
              {[
                { label: "今天", value: "today" },
                { label: "近7天", value: "7d" },
                { label: "近30天", value: "30d" },
                { label: "自定义", value: "custom" },
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
          </div>

          {dateRange === "custom" && (
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs text-[#4a5b70] mb-1">开始</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-[#101922] border border-[#1c2630] text-[#c0cad8] text-xs rounded-md px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-xs text-[#4a5b70] mb-1">结束</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-[#101922] border border-[#1c2630] text-[#c0cad8] text-xs rounded-md px-3 py-2"
                />
              </div>
            </div>
          )}

          {/* Refresh Control */}
          <div>
            <label className="block text-xs text-[#4a5b70] mb-1">刷新频率</label>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(parseInt(e.target.value))}
              className="bg-[#101922] border border-[#1c2630] text-[#c0cad8] text-xs rounded-md px-3 py-2"
            >
              <option value="0">手动刷新</option>
              <option value="30">每30秒</option>
              <option value="60">每1分钟</option>
              <option value="300">每5分钟</option>
            </select>
          </div>

          {/* Buttons */}
          <button
            onClick={() => refetch()}
            disabled={data.loading}
            className="px-4 py-2 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-sm rounded-md disabled:opacity-50 transition-colors"
          >
            刷新数据
          </button>

          <button
            onClick={exportCSV}
            disabled={exporting || !data.hourlyEnergy}
            className="px-4 py-2 bg-[#137fec] hover:bg-[#0f6fd9] text-white text-sm rounded-md disabled:opacity-50 transition-colors"
          >
            {exporting ? "导出中..." : "导出CSV"}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {data.stats && (
          <>
            <StatCard
              label="设备总数"
              value={data.stats.totalDevices}
              sub={`在线率 ${(data.stats.onlineRate * 100).toFixed(1)}%`}
              color="text-[#3b9eff]"
            />
            <StatCard
              label="在线设备"
              value={data.stats.onlineDevices}
              sub={`离线 ${data.stats.offlineDevices}`}
              color="text-green-400"
            />
            <StatCard
              label="今日能耗"
              value={`${data.stats.todayKwh.toFixed(2)} kWh`}
              sub={`环比 ${data.stats.energyGrowthRate > 0 ? "+" : ""}${(data.stats.energyGrowthRate * 100).toFixed(1)}%`}
              color="text-yellow-400"
            />
            <StatCard
              label="峰值功率"
              value={`${data.stats.todayPeakWatts.toFixed(0)} W`}
              sub="今日峰值"
              color="text-red-400"
            />
          </>
        )}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly Energy Trend */}
        <ChartCard title="24小时能耗趋势">
          {data.hourlyEnergy?.hourlyData ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.hourlyEnergy.hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                <XAxis dataKey="hour" stroke="#4a5b70" fontSize={12} />
                <YAxis stroke="#4a5b70" fontSize={12} tickFormatter={(v) => `${v}kWh`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1520",
                    border: "1px solid #1c2630",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "#8a9baf" }}
                  formatter={(value: number) => [`${value.toFixed(3)} kWh`, "能耗"]}
                />
                <Area type="monotone" dataKey="kwh" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-[#4a5b70]">暂无数据</div>
          )}
        </ChartCard>

        {/* Device Type Distribution */}
        <ChartCard title="设备类型分布">
          {data.deviceTypeDistribution?.distribution ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.deviceTypeDistribution.distribution}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data.deviceTypeDistribution.distribution.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1520",
                    border: "1px solid #1c2630",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-[#4a5b70]">暂无数据</div>
          )}
        </ChartCard>

        {/* Room Energy Ranking */}
        <ChartCard title="房间能耗排行">
          {data.roomEnergyRanking?.ranking ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.roomEnergyRanking.ranking} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                <XAxis type="number" stroke="#4a5b70" fontSize={12} tickFormatter={(v) => `${v}kWh`} />
                <YAxis dataKey="roomName" type="category" stroke="#4a5b70" fontSize={12} width={80} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1520",
                    border: "1px solid #1c2630",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => [`${value.toFixed(2)} kWh`, "能耗"]}
                />
                <Bar dataKey="kwh" fill="#3b9eff" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-[#4a5b70]">暂无数据</div>
          )}
        </ChartCard>

        {/* Floor Device Status */}
        <ChartCard title="楼层设备状态">
          {data.floorStatus?.floors ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.floorStatus.floors}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                <XAxis dataKey="floorName" stroke="#4a5b70" fontSize={12} />
                <YAxis stroke="#4a5b70" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1520",
                    border: "1px solid #1c2630",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="online" stackId="a" fill="#4ade80" name="在线" />
                <Bar dataKey="offline" stackId="a" fill="#f87171" name="离线" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-[#4a5b70]">暂无数据</div>
          )}
        </ChartCard>

        {/* Function Radar Chart */}
        <ChartCard title="功能类型分布">
          {data.functionDistribution?.radarData ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data.functionDistribution.radarData}>
                <PolarGrid stroke="#1c2630" />
                <PolarAngleAxis dataKey="label" tick={{ fill: "#8a9baf", fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: "#4a5b70", fontSize: 11 }} />
                <Radar name="设备数量" dataKey="count" stroke="#3b9eff" fill="#3b9eff" fillOpacity={0.3} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1520",
                    border: "1px solid #1c2630",
                    borderRadius: "8px",
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-[#4a5b70]">暂无数据</div>
          )}
        </ChartCard>

        {/* Realtime Power Monitor */}
        <ChartCard title="实时功率监控">
          {power.data && power.data.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={power.data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#4a5b70"
                  fontSize={12}
                  tickFormatter={(v) => new Date(v).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                />
                <YAxis stroke="#4a5b70" fontSize={12} tickFormatter={(v) => `${v}W`} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1520",
                    border: "1px solid #1c2630",
                    borderRadius: "8px",
                  }}
                  labelFormatter={(v) => new Date(v).toLocaleTimeString("zh-CN")}
                  formatter={(value: number) => [`${value.toFixed(1)} W`, "功率"]}
                />
                <Line type="monotone" dataKey="watts" stroke="#4ade80" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-[#4a5b70]">
              <p className="mb-2">当前功率: {power.current.toFixed(1)} W</p>
              <p className="text-xs">无实时数据</p>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Events Table */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1c2630]">
          <h2 className="text-sm font-medium text-white">最近事件告警</h2>
        </div>
        {data.events?.events && data.events.events.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1c2630]">
                  <th className="text-left text-xs text-[#4a5b70] font-medium px-5 py-3">时间</th>
                  <th className="text-left text-xs text-[#4a5b70] font-medium px-5 py-3">设备</th>
                  <th className="text-left text-xs text-[#4a5b70] font-medium px-5 py-3">事件类型</th>
                  <th className="text-left text-xs text-[#4a5b70] font-medium px-5 py-3">消息</th>
                  <th className="text-left text-xs text-[#4a5b70] font-medium px-5 py-3">状态</th>
                </tr>
              </thead>
              <tbody>
                {data.events.events.map((e) => (
                  <tr key={e.id} className="border-b border-[#1c2630] last:border-0 hover:bg-[#0d1520]">
                    <td className="text-[#8a9baf] px-5 py-3">{new Date(e.timestamp).toLocaleString("zh-CN")}</td>
                    <td className="text-[#c0cad8] px-5 py-3">{e.deviceName}</td>
                    <td className="text-[#c0cad8] px-5 py-3">{e.type}</td>
                    <td className="text-[#c0cad8] px-5 py-3">{e.message}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block px-2 py-1 text-xs rounded ${
                          e.status === "unread"
                            ? "bg-red-500/20 text-red-400"
                            : e.status === "read"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-green-500/20 text-green-400"
                        }`}
                      >
                        {e.status === "unread" ? "未读" : e.status === "read" ? "已读" : "已处理"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-[#4a5b70] text-sm py-8">暂无事件数据</p>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  return (
    <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
      <p className="text-xs text-[#4a5b70] mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      <p className="text-xs text-[#4a5b70] mt-1">{sub}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
      <h2 className="text-sm font-medium text-white mb-4">{title}</h2>
      <div className="h-64">{children}</div>
    </div>
  );
}

function GatewayStatus({ status }: { status: string }) {
  const color =
    status === "connected"
      ? "bg-green-500"
      : status === "reconnecting"
      ? "bg-yellow-500"
      : "bg-red-500";
  const label =
    status === "connected"
      ? "网关在线"
      : status === "reconnecting"
      ? "重新连接中..."
      : status === "connecting"
      ? "连接中..."
      : "网关离线";
  return (
    <div className="flex items-center gap-2 text-sm text-[#8a9baf]">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </div>
  );
}