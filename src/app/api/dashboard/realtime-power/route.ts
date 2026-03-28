import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取实时功率数据（最近60分钟）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lastMinutes = parseInt(searchParams.get("lastMinutes") || "60");

    // 计算时间范围
    const endTime = new Date();
    const startTime = new Date(Date.now() - lastMinutes * 60 * 1000);

    // 获取最近时间段的能耗快照
    const snapshots = await prisma.energySnapshot.findMany({
      where: {
        timestamp: {
          gte: startTime,
          lte: endTime,
        },
      },
      include: {
        device: {
          select: { name: true, ratedPower: true },
        },
      },
      orderBy: { timestamp: "asc" },
      take: 100, // 限制最多100个数据点
    });

    // 如果没有快照数据，返回估算数据
    if (snapshots.length === 0) {
      // 从设备额定功率估算当前功率
      const devices = await prisma.device.findMany({
        where: { alive: 1 },
        select: { ratedPower: true },
      });

      const currentPower = devices.reduce((sum, d) => sum + d.ratedPower, 0);

      return Response.json({
        data: [],
        current: currentPower,
        average: currentPower,
        message: "无实时数据，显示额定功率估算",
      });
    }

    // 按时间聚合功率数据
    const powerData: { timestamp: string; watts: number }[] = [];

    // 每5分钟一个数据点
    const intervalMs = 5 * 60 * 1000;
    for (let t = startTime.getTime(); t <= endTime.getTime(); t += intervalMs) {
      const intervalStart = new Date(t);
      const intervalEnd = new Date(t + intervalMs);

      const intervalSnapshots = snapshots.filter((s) => {
        const ts = new Date(s.timestamp);
        return ts >= intervalStart && ts < intervalEnd;
      });

      // 计算该时间段的总功率（kWh转W，粗略估算）
      const avgPower = intervalSnapshots.length > 0
        ? intervalSnapshots.reduce((sum, s) => sum + s.kwh * 1000, 0) / intervalSnapshots.length
        : 0;

      powerData.push({
        timestamp: intervalStart.toISOString(),
        watts: avgPower,
      });
    }

    // 当前功率和平均功率
    const currentWatts = powerData.length > 0 ? powerData[powerData.length - 1].watts : 0;
    const avgWatts = powerData.length > 0
      ? powerData.reduce((sum, p) => sum + p.watts, 0) / powerData.length
      : 0;

    return Response.json({
      data: powerData,
      current: currentWatts,
      average: avgWatts,
      peak: Math.max(...powerData.map((p) => p.watts)),
    });
  } catch (error) {
    console.error("Realtime power error:", error);
    return NextResponse.json({ error: "获取实时功率失败" }, { status: 500 });
  }
}