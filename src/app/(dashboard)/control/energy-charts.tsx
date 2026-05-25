"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

export interface EnergyData {
  date: string;
  value: number;
  carbonEmission?: number;
}

// ==================== 能耗图表组件 ====================
export function EnergyChart({ data }: { data: EnergyData[] }) {
  const maxValue = Math.max(...data.map((d) => d.value));
  const minValue = Math.min(...data.map((d) => d.value));
  const range = maxValue - minValue || 1;

  return (
    <div className="h-64 flex items-end justify-between gap-2 px-2">
      {data.map((item, index) => {
        const height = 40 + ((item.value - minValue) / range) * 160;
        const carbonEmission = item.carbonEmission ?? 0;
        return (
          <div key={index} className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all duration-300 hover:from-blue-500 hover:to-blue-300"
              style={{ height: `${height}px`, minHeight: "20px" }}
              title={`${item.date}: ${item.value.toFixed(3)} kWh\n碳排放: ${carbonEmission.toFixed(3)} kgCO₂e`}
            />
            <span className="text-xs text-gray-500">{item.date}</span>
          </div>
        );
      })}
    </div>
  );
}

// 柱状图组件
export function EnergyBarChart({ data }: { data: { name: string; value: number }[] }) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  const colors = [
    "from-blue-600 to-blue-400",
    "from-green-600 to-green-400",
    "from-yellow-600 to-yellow-400",
    "from-red-600 to-red-400",
    "from-purple-600 to-purple-400",
    "from-pink-600 to-pink-400",
    "from-indigo-600 to-indigo-400",
    "from-teal-600 to-teal-400",
  ];

  return (
    <div className="space-y-3">
      {data.slice(0, 8).map((item, index) => {
        const height = (item.value / maxValue) * 120;
        return (
          <div key={item.name} className="flex items-center gap-3">
            <span className="text-sm text-gray-300 w-20 truncate" title={item.name}>{item.name}</span>
            <div className="flex-1 h-6 bg-gray-700/30 rounded overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${colors[index % colors.length]} rounded transition-all duration-300`}
                style={{ width: `${(item.value / maxValue) * 100}%`, minWidth: "2px" }}
                title={`${item.value.toFixed(2)} kWh`}
              />
            </div>
            <span className="text-sm text-gray-400 w-24 text-right">{item.value.toFixed(2)} kWh</span>
          </div>
        );
      })}
    </div>
  );
}

// 今日能耗 - 小时趋势图 (Recharts)
export function TodayEnergyHourlyChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="colorToday" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="hour" stroke="#9ca3af" fontSize={12} />
        <YAxis stroke="#9ca3af" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "none",
            borderRadius: "8px",
          }}
        />
        <Area
          type="monotone"
          dataKey="kwh"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#colorToday)"
          name="能耗(kWh)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// 今日能耗 - 空间对比柱状图 (Recharts)
export function TodayEnergyRoomChart({ data }: { data: any[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey="roomName"
          stroke="#9ca3af"
          fontSize={11}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis stroke="#9ca3af" fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1f2937",
            border: "none",
            borderRadius: "8px",
          }}
          formatter={(value: number) => [`${value.toFixed(4)} kWh`, "能耗"]}
        />
        <Bar
          dataKey="totalKwh"
          fill="#3b82f6"
          radius={[8, 8, 0, 0]}
          name="能耗(kWh)"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
