import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 批量转移设备
export async function POST(request: Request) {
  try {
    const { deviceIds, targetRoomId } = await request.json();

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return NextResponse.json({ error: "请选择设备" }, { status: 400 });
    }

    if (!targetRoomId) {
      return NextResponse.json({ error: "请选择目标空间" }, { status: 400 });
    }

    // 验证目标空间存在
    const room = await prisma.room.findUnique({ where: { id: targetRoomId } });
    if (!room) {
      return NextResponse.json({ error: "目标空间不存在" }, { status: 404 });
    }

    // 转移设备
    await prisma.device.updateMany({
      where: { id: { in: deviceIds } },
      data: { roomId: targetRoomId },
    });

    return Response.json({
      success: true,
      count: deviceIds.length,
      targetRoomId,
    });
  } catch (error) {
    console.error("Error transferring devices:", error);
    return NextResponse.json({ error: "转移设备失败" }, { status: 500 });
  }
}
