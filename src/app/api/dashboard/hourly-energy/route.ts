import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取 24 小时能耗趋势（聚合所有设备的 EnergyHourly 数据）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().split("T")[0];

    // 按小时聚合所有设备的能耗数据
    const hourlyAgg = await prisma.energyHourly.groupBy({
      by: ["hour"],
      _sum: { kwh: true },
      _max: { peakWatts: true },
      where: { date },
    });

    // 按小时组织数据
    const hourlyData: { hour: string; kwh: number; peakWatts: number }[] = [];

    for (let h = 0; h < 24; h++) {
      const record = hourlyAgg.find((r) => r.hour === h);
      hourlyData.push({
        hour: `${h.toString().padStart(2, "0")}:00`,
        kwh: record?._sum.kwh ?? 0,
        peakWatts: record?._max.peakWatts ?? 0,
      });
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
