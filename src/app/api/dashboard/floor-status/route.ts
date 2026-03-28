import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取楼层设备状态
export async function GET() {
  try {
    // 获取所有楼层
    const floors = await prisma.room.findMany({
      where: { type: "floor" },
      include: {
        children: {
          // 楼层下的房间
          include: {
            devices: {
              select: { id: true, alive: true, name: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // 计算每个楼层的设备状态
    const floorStatus = floors.map((floor) => {
      const allDevices = floor.children.flatMap((room) => room.devices);
      const total = allDevices.length;
      const online = allDevices.filter((d) => d.alive === 1).length;
      const offline = total - online;

      return {
        floorId: floor.id,
        floorName: floor.name,
        total,
        online,
        offline,
        onlineRate: total > 0 ? online / total : 0,
        rooms: floor.children.map((room) => ({
          roomId: room.id,
          roomName: room.name,
          deviceCount: room.devices.length,
          onlineCount: room.devices.filter((d) => d.alive === 1).length,
        })),
      };
    });

    // 如果没有楼层，尝试从所有房间统计
    if (floors.length === 0) {
      const allRooms = await prisma.room.findMany({
        where: { type: "room" },
        include: {
          devices: {
            select: { id: true, alive: true },
          },
        },
      });

      const allDevices = allRooms.flatMap((r) => r.devices);
      const total = allDevices.length;
      const online = allDevices.filter((d) => d.alive === 1).length;

      floorStatus.push({
        floorId: "all",
        floorName: "全部楼层",
        total,
        online,
        offline: total - online,
        onlineRate: total > 0 ? online / total : 0,
        rooms: allRooms.map((r) => ({
          roomId: r.id,
          roomName: r.name,
          deviceCount: r.devices.length,
          onlineCount: r.devices.filter((d) => d.alive === 1).length,
        })),
      });
    }

    return Response.json({
      floors: floorStatus,
      total: floorStatus.reduce((sum, f) => sum + f.total, 0),
      totalOnline: floorStatus.reduce((sum, f) => sum + f.online, 0),
    });
  } catch (error) {
    console.error("Floor status error:", error);
    return NextResponse.json({ error: "获取楼层状态失败" }, { status: 500 });
  }
}