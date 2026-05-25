import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLocalDate, getLocalDateOffset } from "@/lib/utils";

export const runtime = "nodejs";

// 获取房间能耗排行 Top 10（优化：仅查询需要的字段，避免加载完整嵌套对象）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || getLocalDateOffset(-7);
    const to = searchParams.get("to") || getLocalDate();
    const limit = parseInt(searchParams.get("limit") || "10");

    // 直接查询能耗记录，按房间聚合（避免加载完整的 rooms->devices->records 嵌套结构）
    const energyRecords = await prisma.energyRecord.findMany({
      where: {
        date: { gte: from, lte: to },
        device: { room: { type: "room" } },
      },
      select: {
        kwh: true,
        peakWatts: true,
        device: {
          select: {
            roomId: true,
            room: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // 按房间聚合能耗
    const roomMap = new Map<string, { roomName: string; kwh: number; peakWatts: number }>();
    for (const record of energyRecords) {
      const roomId = record.device.roomId;
      if (!roomId || !record.device.room) continue;

      const existing = roomMap.get(roomId);
      if (existing) {
        existing.kwh += record.kwh;
        existing.peakWatts = Math.max(existing.peakWatts, record.peakWatts);
      } else {
        roomMap.set(roomId, {
          roomName: record.device.room.name,
          kwh: record.kwh,
          peakWatts: record.peakWatts,
        });
      }
    }

    // 排序并取前 N 个
    const ranking = Array.from(roomMap.entries())
      .map(([roomId, data]) => ({ roomId, ...data }))
      .filter((r) => r.kwh > 0)
      .sort((a, b) => b.kwh - a.kwh)
      .slice(0, limit);

    return Response.json({
      ranking,
      period: { from, to },
    });
  } catch (error) {
    console.error("Room energy ranking error:", error);
    return NextResponse.json({ error: "获取房间能耗排行失败" }, { status: 500 });
  }
}