import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 中国电网排放因子 (kg CO2/kWh) - 根据生态环境部数据
const GRID_EMISSION_FACTOR = 0.5703;

/**
 * 获取碳排放统计数据
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateRange = searchParams.get("range") || "today";

    // 计算时间范围
    const today = new Date();
    const to = today.toISOString().split("T")[0];
    let from: string;
    let label: string;

    switch (dateRange) {
      case "today":
        from = to;
        label = "今日";
        break;
      case "week":
        from = new Date(Date.now() - 6 * 86400000).toISOString().split("T")[0];
        label = "近 7 天";
        break;
      case "month":
        from = new Date(Date.now() - 29 * 86400000).toISOString().split("T")[0];
        label = "近 30 天";
        break;
      default:
        from = to;
        label = "今日";
    }

    // 获取能耗数据
    const energyRecords = await prisma.energyRecord.aggregate({
      _sum: { kwh: true },
      _max: { peakWatts: true },
      where: {
        date: {
          gte: from,
          lte: to,
        },
      },
    });

    const totalKwh = energyRecords._sum.kwh ?? 0;
    const totalCarbon = totalKwh * GRID_EMISSION_FACTOR; // kg CO2

    // 获取上期为对比数据
    let prevFrom: string;
    let prevTo: string;
    if (dateRange === "today") {
      prevTo = new Date(Date.now() - 86400000).toISOString().split("T")[0];
      prevFrom = prevTo;
    } else if (dateRange === "week") {
      prevTo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      prevFrom = new Date(Date.now() - 13 * 86400000).toISOString().split("T")[0];
    } else {
      prevTo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      prevFrom = new Date(Date.now() - 59 * 86400000).toISOString().split("T")[0];
    }

    const prevEnergy = await prisma.energyRecord.aggregate({
      _sum: { kwh: true },
      where: {
        date: {
          gte: prevFrom,
          lte: prevTo,
        },
      },
    });

    const prevKwh = prevEnergy._sum.kwh ?? 0;
    const prevCarbon = prevKwh * GRID_EMISSION_FACTOR;

    // 计算增长率
    const growthRate = prevKwh > 0 ? (totalKwh - prevKwh) / prevKwh : 0;

    // 等效植树数 (1 棵树年吸收约 12kg CO2)
    const treesNeeded = totalCarbon / 12;

    return Response.json({
      period: label,
      totalKwh,
      totalCarbon, // kg CO2
      prevCarbon, // kg CO2
      growthRate,
      emissionFactor: GRID_EMISSION_FACTOR,
      treesNeeded,
      peakWatts: energyRecords._max.peakWatts ?? 0,
    });
  } catch (error) {
    console.error("Carbon emissions error:", error);
    return NextResponse.json({ error: "获取碳排放数据失败" }, { status: 500 });
  }
}
