import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取房间能耗排行 Top 10
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const to = searchParams.get("to") || new Date().toISOString().split("T")[0];
    const limit = parseInt(searchParams.get("limit") || "10");

    // 获取所有房间及其设备的能耗数据
    const rooms = await prisma.room.findMany({
      where: { type: "room" }, // 只查询房间层级
      include: {
        devices: {
          include: {
            energyRecords: {
              where: {
                date: {
                  gte: from,
                  lte: to,
                },
              },
            },
          },
        },
      },
    });

    // 计算每个房间的总能耗
    const ranking = rooms
      .map((room) => {
        const totalKwh = room.devices.reduce(
          (sum, device) => sum + device.energyRecords.reduce((s, r) => s + r.kwh, 0),
          0
        );

        const peakWatts = room.devices.reduce(
          (max, device) =>
            Math.max(max, device.energyRecords.reduce((m, r) => Math.max(m, r.peakWatts), 0)),
          0
        );

        return {
          roomId: room.id,
          roomName: room.name,
          kwh: totalKwh,
          peakWatts,
          deviceCount: room.devices.length,
        };
      })
      .filter((r) => r.kwh > 0) // 只返回有能耗数据的房间
      .sort((a, b) => b.kwh - a.kwh) // 按能耗降序排序
      .slice(0, limit); // 取前 N 个

    return Response.json({
      ranking,
      period: { from, to },
    });
  } catch (error) {
    console.error("Room energy ranking error:", error);
    return NextResponse.json({ error: "获取房间能耗排行失败" }, { status: 500 });
  }
}