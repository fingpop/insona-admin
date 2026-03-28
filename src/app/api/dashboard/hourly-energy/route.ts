import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取24小时能耗趋势（使用 EnergySnapshot）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // 获取指定日期的能耗快照数据
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);

    const snapshots = await prisma.energySnapshot.findMany({
      where: {
        timestamp: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { timestamp: "asc" },
    });

    // 按小时聚合数据
    // 由于 SQLite，使用 JavaScript 处理小时分组
    const hourlyData: { hour: string; kwh: number; peakWatts: number }[] = [];

    for (let h = 0; h < 24; h++) {
      const hourStr = `${h.toString().padStart(2, "0")}:00`;
      const hourSnapshots = snapshots.filter((s) => {
        const hour = new Date(s.timestamp).getUTCHours();
        return hour === h;
      });

      const totalKwh = hourSnapshots.reduce((sum, s) => sum + s.kwh, 0);
      const avgKwh = hourSnapshots.length > 0 ? totalKwh / hourSnapshots.length : 0;
      const peakWatts = hourSnapshots.reduce((max, s) => Math.max(max, s.kwh * 1000), 0); // 粗略估算峰值功率

      hourlyData.push({
        hour: hourStr,
        kwh: avgKwh,
        peakWatts,
      });
    }

    // 如果没有快照数据，尝试从 EnergyRecord 估算
    if (snapshots.length === 0) {
      const dayRecord = await prisma.energyRecord.findMany({
        where: { date },
      });

      const totalKwh = dayRecord.reduce((sum, r) => sum + r.kwh, 0);
      const avgHourlyKwh = totalKwh / 24;

      // 填充估算数据
      for (let h = 0; h < 24; h++) {
        hourlyData[h] = {
          hour: `${h.toString().padStart(2, "0")}:00`,
          kwh: avgHourlyKwh,
          peakWatts: dayRecord.reduce((max, r) => Math.max(max, r.peakWatts), 0),
        };
      }
    }

    return Response.json({
      hourlyData,
      total: hourlyData.reduce((sum, h) => sum + h.kwh, 0),
      date,
    });
  } catch (error) {
    console.error("Hourly energy error:", error);
    return NextResponse.json({ error: "获取小时能耗数据失败" }, { status: 500 });
  }
}