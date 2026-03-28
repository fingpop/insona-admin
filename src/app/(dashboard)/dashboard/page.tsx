"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGatewayEvents } from "@/hooks/useGatewayEvents";
import { DEVICE_TYPE_LABELS } from "@/lib/types";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Device {
  id: string;
  name: string;
  type: number;
  alive: number;
  func: number;
  room?: { name: string } | null;
}

interface Room {
  id: string;
  name: string;
  deviceCount: number;
  onlineDeviceCount: number;
}

interface EnergyTotals {
  kwh: number;
  peakWatts: number;
}

interface DailyTotal {
  date: string;
  kwh: number;
}

export default function DashboardPage() {
  const { status } = useGatewayEvents();
  const [devices, setDevices] = useState<Device[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [energy, setEnergy] = useState<EnergyTotals>({ kwh: 0, peakWatts: 0 });
  const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
  const [recentEvents, setRecentEvents] = useState<unknown[]>([]);

  useEffect(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d) => setDevices(d.devices ?? []));
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((d) => setRooms(d.rooms ?? []));
    // 获取7天能耗数据
    fetch("/api/energy?from=" + getDateStr(-7))
      .then((r) => r.json())
      .then((d) => {
        setEnergy(d.totals ?? { kwh: 0, peakWatts: 0 });
        setDailyTotals(
          (d.dailyTotals ?? []).map((item: { date: string; _sum: { kwh: number | null } }) => ({
            date: item.date,
            kwh: item._sum.kwh ?? 0,
          }))
        );
      });
  }, []);

  const onlineCount = devices.filter((d) => d.alive === 1).length;
  const offlineCount = devices.length - onlineCount;
  const todayKwh = energy.kwh;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">系统概览</h1>
        <GatewayStatus status={status} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="在线设备"
          value={onlineCount}
          sub={`共 ${devices.length} 台`}
          color="text-green-400"
          href="/devices"
        />
        <StatCard
          label="离线设备"
          value={offlineCount}
          sub="需要检查"
          color="text-red-400"
          href="/devices?alive=0"
        />
        <StatCard
          label="7天总能耗"
          value={`${todayKwh.toFixed(2)} kWh`}
          sub={`峰值 ${energy.peakWatts.toFixed(0)} W`}
          color="text-yellow-400"
          href="/energy"
        />
      </div>

      {/* 能耗趋势图表 */}
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-white">能耗趋势</h2>
          <Link href="/energy" className="text-xs text-[#3b9eff] hover:underline">
            详情 →
          </Link>
        </div>
        {dailyTotals.length > 0 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTotals}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2630" />
                <XAxis
                  dataKey="date"
                  stroke="#4a5b70"
                  fontSize={12}
                  tickFormatter={(v) => v.slice(5)}
                />
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
                <Area
                  type="monotone"
                  dataKey="kwh"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-[#4a5b70] text-sm">
            暂无能耗数据
          </div>
        )}
      </div>

      {/* Two-column section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rooms overview */}
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">房间概览</h2>
            <Link href="/rooms" className="text-xs text-[#3b9eff] hover:underline">
              管理 →
            </Link>
          </div>
          {rooms.length === 0 ? (
            <p className="text-sm text-[#4a5b70]">暂无房间数据，请先同步设备</p>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex items-center justify-between py-2 border-b border-[#1c2630] last:border-0"
                >
                  <span className="text-sm text-[#c0cad8]">{room.name}</span>
                  <span className="text-xs text-[#4a5b70]">
                    {room.onlineDeviceCount}/{room.deviceCount} 在线
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Device type breakdown */}
        <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-white">设备类型分布</h2>
            <Link href="/devices" className="text-xs text-[#3b9eff] hover:underline">
              全部设备 →
            </Link>
          </div>
          <div className="space-y-2">
            {Object.entries(
              devices.reduce<Record<number, { count: number; online: number; label: string }>>(
                (acc, d) => {
                  const label = DEVICE_TYPE_LABELS[d.type] ?? `类型${d.type}`;
                  if (!acc[d.type]) acc[d.type] = { count: 0, online: 0, label };
                  acc[d.type].count++;
                  if (d.alive === 1) acc[d.type].online++;
                  return acc;
                },
                {}
              )
            ).map(([type, info]) => (
              <div
                key={type}
                className="flex items-center justify-between py-2 border-b border-[#1c2630] last:border-0"
              >
                <span className="text-sm text-[#c0cad8]">{info.label}</span>
                <span className="text-xs text-[#4a5b70]">
                  {info.online}/{info.count} 在线
                </span>
              </div>
            ))}
            {devices.length === 0 && (
              <p className="text-sm text-[#4a5b70]">暂无设备数据</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  href,
}: {
  label: string;
  value: string | number;
  sub: string;
  color: string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <div className="bg-[#101922] rounded-lg border border-[#1c2630] p-5 hover:border-[#253040] transition-colors">
        <p className="text-xs text-[#4a5b70] mb-1">{label}</p>
        <p className={`text-2xl font-semibold ${color}`}>{value}</p>
        <p className="text-xs text-[#4a5b70] mt-1">{sub}</p>
      </div>
    </Link>
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

function getDateStr(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
