import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 绑定设备到空间
export async function POST(request: Request) {
  try {
    const { deviceIds, roomId } = await request.json();

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return NextResponse.json({ error: "请选择设备" }, { status: 400 });
    }

    if (!roomId) {
      return NextResponse.json({ error: "请选择目标空间" }, { status: 400 });
    }

    // 验证空间存在
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      return NextResponse.json({ error: "目标空间不存在" }, { status: 404 });
    }

    // 更新设备
    await prisma.device.updateMany({
      where: { id: { in: deviceIds } },
      data: { roomId },
    });

    return Response.json({
      success: true,
      count: deviceIds.length,
      roomId,
    });
  } catch (error) {
    console.error("Error binding devices:", error);
    return NextResponse.json({ error: "绑定设备失败" }, { status: 500 });
  }
}

// 解绑设备
export async function DELETE(request: Request) {
  try {
    const { deviceIds } = await request.json();

    if (!deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
      return NextResponse.json({ error: "请选择设备" }, { status: 400 });
    }

    // 解绑设备
    await prisma.device.updateMany({
      where: { id: { in: deviceIds } },
      data: { roomId: null },
    });

    return Response.json({
      success: true,
      count: deviceIds.length,
    });
  } catch (error) {
    console.error("Error unbinding devices:", error);
    return NextResponse.json({ error: "解绑设备失败" }, { status: 500 });
  }
}
