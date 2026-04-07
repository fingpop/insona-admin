import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 碳排放系数 (中国平均电网排放因子, 2024年数据)
const CARBON_EMISSION_FACTOR = 0.5586; // kgCO₂e/kWh

// GET - 获取当天能耗统计（优化版：从聚合表查询）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");
    const roomId = searchParams.get("roomId");

    const today = new Date().toISOString().split("T")[0];

    if (deviceId) {
      // 单设备查询：最近 1 小时明细 + 今天的小时聚合
      const [recentData, hourlyData] = await Promise.all([
        // 最近 1 小时明细
        prisma.energyData.findMany({
          where: {
            deviceId,
            timestamp: { gte: new Date(Date.now() - 3600000) }
          },
          include: {
            device: {
              include: { room: true }
            }
          },
          orderBy: { sequence: "desc" }
        }),
        // 今天的小时聚合
        prisma.energyHourly.findMany({
          where: { deviceId, date: today },
          orderBy: { hour: "asc" }
        })
      ]);

      const recentKwh = recentData.reduce((sum, d) => sum + d.kwh, 0);
      const hourlyKwh = hourlyData.reduce((sum, h) => sum + h.kwh, 0);
      const totalKwh = recentKwh + hourlyKwh;
      const totalCarbonEmission = totalKwh * CARBON_EMISSION_FACTOR;

      // 填充所有24小时
      const hourlyStats = [];
      for (let h = 0; h < 24; h++) {
        const hourly = hourlyData.find(hd => hd.hour === h);
        hourlyStats.push({
          hour: `${h.toString().padStart(2, "0")}:00`,
          kwh: hourly?.kwh || 0,
          count: hourly?.dataCount || 0,
        });
      }

      return Response.json({
        date: today,
        totalKwh,
        totalCarbonEmission,
        recentKwh,
        hourlyKwh,
        hourlyData: hourlyStats,
        latestData: recentData.slice(0, 10),
      });
    }

    // 全部设备：直接读日汇总
    let deviceFilter: any = {};
    if (roomId) {
      const devices = await prisma.device.findMany({
        where: { roomId },
        select: { id: true },
      });
      deviceFilter = { deviceId: { in: devices.map((d) => d.id) } };
    }

    const records = await prisma.energyRecord.findMany({
      where: { date: today, ...deviceFilter },
      include: {
        device: {
          include: { room: true }
        }
      }
    });

    const totalKwh = records.reduce((sum, r) => sum + r.kwh, 0);
    const totalCarbonEmission = totalKwh * CARBON_EMISSION_FACTOR;

    // 按房间分组统计
    const roomStats = new Map<string, { roomName: string; totalKwh: number; deviceCount: number }>();
    for (const record of records) {
      const roomName = record.device.room?.name || "未绑定";
      const existing = roomStats.get(roomName);
      if (existing) {
        existing.totalKwh += record.kwh;
        existing.deviceCount++;
      } else {
        roomStats.set(roomName, {
          roomName,
          totalKwh: record.kwh,
          deviceCount: 1,
        });
      }
    }

    // 按小时统计（从 EnergyHourly 聚合）
    const hourlyAgg = await prisma.energyHourly.groupBy({
      by: ["hour"],
      where: { date: today, ...deviceFilter },
      _sum: { kwh: true, dataCount: true },
      orderBy: { hour: "asc" }
    });

    const hourlyData = [];
    for (let h = 0; h < 24; h++) {
      const hourly = hourlyAgg.find(ha => ha.hour === h);
      hourlyData.push({
        hour: `${h.toString().padStart(2, "0")}:00`,
        kwh: hourly?._sum.kwh || 0,
        count: hourly?._sum.dataCount || 0,
      });
    }

    return Response.json({
      date: today,
      totalKwh,
      totalCarbonEmission,
      recordCount: records.length,
      deviceStats: records.map(r => ({
        deviceId: r.deviceId,
        deviceName: r.device.name,
        roomName: r.device.room?.name || "未绑定",
        totalKwh: r.kwh,
        peakWatts: r.peakWatts,
      })),
      roomStats: Array.from(roomStats.values()),
      hourlyData,
    });
  } catch (error) {
    console.error("Today energy error:", error);
    return NextResponse.json({ error: "获取今日能耗数据失败" }, { status: 500 });
  }
}