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
  Legend,
} from "recharts";

interface EnergyRecord {
  id: string;
  deviceId: string;
  date: string;
  kwh: number;
  peakWatts: number;
  device?: { name: string; type: number; room?: { name: string } | null };
}

interface DailyTotal {
  date: string;
  kwh: number;
  carbonEmission: number; // 碳排放 (kgCO₂e)
}

// 碳排放系数 (中国平均电网排放因子, 2024年数据)
const CARBON_EMISSION_FACTOR = 0.5586; // kgCO₂e/kWh

type DateRange = "today" | "7d" | "30d" | "custom";

function getDateStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function EnergyPage() {
  const [records, setRecords] = useState<EnergyRecord[]>([]);
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [totals, setTotals] = useState({ kwh: 0, peakWatts: 0, carbonEmission: 0 });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [customFrom, setCustomFrom] = useState(getDateStr(-30));
  const [customTo, setCustomTo] = useState(getDateStr(0));
  const [roomFilter, setRoomFilter] = useState("");
  const [rooms, setRooms] = useState<{ id: string; name: string }[]>([]);
  const [exporting, setExporting] = useState(false);

  const getDateParams = () => {
    const to = getDateStr(0);
    let from: string;
    switch (dateRange) {
      case "today": from = getDateStr(0); break;
      case "7d": from = getDateStr(-7); break;
      case "30d": from = getDateStr(-30); break;
      case "custom": from = customFrom; break;
      default: from = getDateStr(-7);
    }
    return { from, to };
  };

  const fetchData = () => {
    setLoading(true);
    const { from, to } = getDateParams();
    const params = new URLSearchParams({ from, to });
    if (roomFilter) params.set("roomId", roomFilter);

    Promise.all([
      fetch(`/api/energy?${params}`).then((r) => r.json()),
      fetch("/api/rooms").then((r) => r.json()),
    ])
      .then(([energyData, roomsData]) => {
        setRecords(energyData.records ?? []);
        setDailyTotals(
          (energyData.dailyTotals ?? []).map((d: { date: string; _sum: { kwh: number | null } }) => ({
            date: d.date,
            kwh: d._sum.kwh ?? 0,
            carbonEmission: (d._sum.kwh ?? 0) * CARBON_EMISSION_FACTOR,
          }))
        );
        setTotals(energyData.totals ?? { kwh: 0, peakWatts: 0, carbonEmission: 0 });
        setRooms(roomsData.rooms ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [dateRange, roomFilter, customFrom, customTo]);

  const exportCSV = () => {
    setExporting(true);
    const headers = ["日期", "设备名称", "设备类型", "房间", "kWh", "碳排放(kgCO₂e)", "峰值W"];
    const rows = records.map((r) => [
      r.date,
      r.device?.name ?? r.deviceId,
      r.device?.type ?? "",
      r.device?.room?.name ?? "",
      r.kwh.toFixed(3),
      (r.kwh * CARBON_EMISSION_FACTOR).toFixed(3),
      r.peakWatts.toFixed(1),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `energy_${getDateStr(0)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">能耗管理</h1>
        <button
          onClick={exportCSV}
          disabled={exporting || records.length === 0}
          className="px-4 py-2 bg-[#1c2630] hover:bg-[#253040] text-[#8a9baf] text-sm rounded-md disabled:opacity-50 transition-colors"
        >
          导出 CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
          <p className="text-xs text-[#4a5b70] mb-1">总能耗</p>
          <p className="text-2xl font-semibold text-[#3b9eff]">{totals.kwh.toFixed(2)} kWh</p>
        </div>
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
          <p className="text-xs text-[#4a5b70] mb-1">峰值功率</p>
          <p className="text-2xl font-semibold text-yellow-400">{totals.peakWatts.toFixed(0)} W</p>
        </div>
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
          <p className="text-xs text-[#4a5b70] mb-1">总碳排放</p>
          <p className="text-2xl font-semibold text-green-400">{totals.carbonEmission.toFixed(2)} kgCO₂e</p>
          <p className="text-xs text-[#4a5b70] mt-2">EF: {CARBON_EMISSION_FACTOR} kgCO₂e/kWh</p>
        </div>
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
          <p className="text-xs text-[#4a5b70] mb-1">记录数</p>
          <p className="text-2xl font-semibold text-white">{records.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
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

        <div>
          <label className="block text-xs text-[#4a5b70] mb-1">房间筛选</label>
          <select
            value={roomFilter}
            onChange={(e) => setRoomFilter(e.target.value)}
            className="bg-[#101922] border border-[#1c2630] text-[#c0cad8] text-xs rounded-md px-3 py-2"
          >
            <option value="">全部房间</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Daily trend chart */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
        <h2 className="text-sm font-medium text-white mb-4">每日能耗与碳排放趋势</h2>
        {dailyTotals.length === 0 ? (
          <p className="text-[#4a5b70] text-sm text-center py-8">
            {loading ? "加载中..." : "暂无能耗数据"}
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTotals}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                <XAxis dataKey="date" tick={{ fill: "#4a5b70", fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: "#4a5b70", fontSize: 11 }} unit=" kWh" />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#4a5b70", fontSize: 11 }} unit=" kgCO₂e" />
                <Tooltip
                  contentStyle={{ background: "#101922", border: "1px solid #1c2630", color: "#c0cad8", fontSize: 12 }}
                  formatter={(value: number, name: string) => {
                    if (name === "kwh") return [`${value.toFixed(3)} kWh`, "能耗"];
                    if (name === "carbonEmission") return [`${value.toFixed(3)} kgCO₂e`, "碳排放"];
                    return [value, name];
                  }}
                />
                <Legend />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="kwh"
                  stroke="#3b9eff"
                  fill="#3b9eff"
                  fillOpacity={0.15}
                  name="kwh"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="carbonEmission"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.15}
                  name="carbonEmission"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Per-device table */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1c2630]">
          <h2 className="text-sm font-medium text-white">设备能耗明细</h2>
        </div>
        {records.length === 0 ? (
          <p className="text-[#4a5b70] text-sm text-center py-8">
            {loading ? "加载中..." : "暂无数据"}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1c2630]">
                  <th className="text-left text-xs text-[#4a5b70] font-medium px-5 py-3">日期</th>
                  <th className="text-left text-xs text-[#4a5b70] font-medium px-5 py-3">设备</th>
                  <th className="text-left text-xs text-[#4a5b70] font-medium px-5 py-3">房间</th>
                  <th className="text-right text-xs text-[#4a5b70] font-medium px-5 py-3">kWh</th>
                  <th className="text-right text-xs text-[#4a5b70] font-medium px-5 py-3">碳排放(kgCO₂e)</th>
                  <th className="text-right text-xs text-[#4a5b70] font-medium px-5 py-3">峰值 W</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-[#1c2630] last:border-0 hover:bg-[#0d1520]">
                    <td className="text-[#8a9baf] px-5 py-3">{r.date}</td>
                    <td className="text-[#c0cad8] px-5 py-3">{r.device?.name ?? r.deviceId}</td>
                    <td className="text-[#4a5b70] px-5 py-3">{r.device?.room?.name ?? "—"}</td>
                    <td className="text-[#3b9eff] text-right px-5 py-3">{r.kwh.toFixed(3)}</td>
                    <td className="text-green-400 text-right px-5 py-3">{(r.kwh * CARBON_EMISSION_FACTOR).toFixed(3)}</td>
                    <td className="text-yellow-400 text-right px-5 py-3">{r.peakWatts.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
