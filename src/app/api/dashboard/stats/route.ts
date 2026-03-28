import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取统计卡片数据
export async function GET() {
  try {
    // 设备统计
    const totalDevices = await prisma.device.count();
    const onlineDevices = await prisma.device.count({ where: { alive: 1 } });
    const offlineDevices = totalDevices - onlineDevices;
    const onlineRate = totalDevices > 0 ? onlineDevices / totalDevices : 0;

    // 今日能耗
    const today = new Date().toISOString().split("T")[0];
    const todayEnergy = await prisma.energyRecord.aggregate({
      _sum: { kwh: true },
      _max: { peakWatts: true },
      where: { date: today },
    });

    // 昨日能耗（环比计算）
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    const yesterdayEnergy = await prisma.energyRecord.aggregate({
      _sum: { kwh: true },
      where: { date: yesterday },
    });

    // 上周同期（7天前）
    const lastWeekStart = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const lastWeekEnd = new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];
    const lastWeekEnergy = await prisma.energyRecord.aggregate({
      _sum: { kwh: true },
      where: {
        date: {
          gte: lastWeekStart,
          lt: yesterday,
        },
      },
    });

    const stats = {
      totalDevices,
      onlineDevices,
      offlineDevices,
      onlineRate,
      todayKwh: todayEnergy._sum.kwh ?? 0,
      todayPeakWatts: todayEnergy._max.peakWatts ?? 0,
      yesterdayKwh: yesterdayEnergy._sum.kwh ?? 0,
      lastWeekKwh: lastWeekEnergy._sum.kwh ?? 0,
      deviceGrowthRate: 0, // 环比增长率（需要历史设备数量数据）
      energyGrowthRate:
        yesterdayEnergy._sum.kwh && yesterdayEnergy._sum.kwh > 0
          ? ((todayEnergy._sum.kwh ?? 0) - yesterdayEnergy._sum.kwh) / yesterdayEnergy._sum.kwh
          : 0,
    };

    return Response.json(stats);
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "获取统计数据失败" }, { status: 500 });
  }
}