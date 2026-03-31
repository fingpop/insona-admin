import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET - 获取当天能耗统计
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");
    const roomId = searchParams.get("roomId");

    const today = new Date().toISOString().split("T")[0];

    // 构建查询条件
    let whereClause: any = { date: today };
    if (deviceId) {
      whereClause.deviceId = deviceId;
    } else if (roomId) {
      const devices = await prisma.device.findMany({
        where: { roomId },
        select: { id: true },
      });
      whereClause.deviceId = { in: devices.map((d) => d.id) };
    }

    // 获取今日能耗数据
    const todayData = await prisma.energyData.findMany({
      where: whereClause,
      include: {
        device: {
          include: {
            room: true,
          },
        },
      },
      orderBy: { sequence: "desc" },
    });

    // 统计总能耗
    const totalKwh = todayData.reduce((sum, d) => sum + d.kwh, 0);

    // 按设备分组统计
    const deviceStats = new Map<
      string,
      {
        deviceId: string;
        deviceName: string;
        roomName: string;
        recordCount: number;
        totalKwh: number;
        latestSequence: number;
        latestPercent: number;
        latestPower: number; // 新增：最新功率
      }
    >();

    for (const record of todayData) {
      const existing = deviceStats.get(record.deviceId);
      if (existing) {
        existing.recordCount++;
        existing.totalKwh += record.kwh;
        if (record.sequence > existing.latestSequence) {
          existing.latestSequence = record.sequence;
          existing.latestPercent = record.percent;
          existing.latestPower = record.power; // 更新最新功率
        }
      } else {
        deviceStats.set(record.deviceId, {
          deviceId: record.deviceId,
          deviceName: record.device.name,
          roomName: record.device.room?.name || "未绑定",
          recordCount: 1,
          totalKwh: record.kwh,
          latestSequence: record.sequence,
          latestPercent: record.percent,
          latestPower: record.power, // 初始化功率
        });
      }
    }

    // 按房间分组统计
    const roomStats = new Map<string, { roomName: string; totalKwh: number; deviceCount: number }>();
    for (const [, device] of deviceStats) {
      const existing = roomStats.get(device.roomName);
      if (existing) {
        existing.totalKwh += device.totalKwh;
        existing.deviceCount++;
      } else {
        roomStats.set(device.roomName, {
          roomName: device.roomName,
          totalKwh: device.totalKwh,
          deviceCount: 1,
        });
      }
    }

    // 按小时统计（需要从timestamp提取小时）
    const hourlyStats = new Map<number, { hour: number; kwh: number; count: number }>();
    for (const record of todayData) {
      const hour = new Date(record.timestamp).getHours();
      const existing = hourlyStats.get(hour);
      if (existing) {
        existing.kwh += record.kwh;
        existing.count++;
      } else {
        hourlyStats.set(hour, { hour, kwh: record.kwh, count: 1 });
      }
    }

    // 填充所有24小时
    const hourlyData = [];
    for (let h = 0; h < 24; h++) {
      const stat = hourlyStats.get(h);
      hourlyData.push({
        hour: `${h.toString().padStart(2, "0")}:00`,
        kwh: stat?.kwh || 0,
        count: stat?.count || 0,
      });
    }

    return Response.json({
      date: today,
      totalKwh,
      recordCount: todayData.length,
      deviceStats: Array.from(deviceStats.values()),
      roomStats: Array.from(roomStats.values()),
      hourlyData,
      latestData: todayData.slice(0, 10), // 最新10条记录
    });
  } catch (error) {
    console.error("Today energy error:", error);
    return NextResponse.json({ error: "获取今日能耗数据失败" }, { status: 500 });
  }
}