import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取单个空间详情
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        children: {
          include: {
            children: true,
            _count: { select: { devices: true } },
          },
        },
        devices: {
          include: { room: { select: { name: true } } },
        },
        _count: { select: { devices: true } },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "空间不存在" }, { status: 404 });
    }

    return Response.json({ room });
  } catch (error) {
    console.error("Error fetching room:", error);
    return NextResponse.json({ error: "获取空间详情失败" }, { status: 500 });
  }
}

// 更新空间
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, type, parentId, meshId } = await request.json();

    // 检查空间是否存在
    const existing = await prisma.room.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "空间不存在" }, { status: 404 });
    }

    // 验证父级空间存在且不是自己
    if (parentId) {
      if (parentId === id) {
        return NextResponse.json({ error: "不能将自己设为父级" }, { status: 400 });
      }
      const parent = await prisma.room.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ error: "父级空间不存在" }, { status: 400 });
      }
    }

    const room = await prisma.room.update({
      where: { id },
      data: {
        name,
        type,
        parentId: parentId || null,
        meshId,
      },
    });

    return Response.json({ room });
  } catch (error) {
    console.error("Error updating room:", error);
    return NextResponse.json({ error: "更新空间失败" }, { status: 500 });
  }
}

// 删除空间
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 检查空间是否存在
    const room = await prisma.room.findUnique({
      where: { id },
      include: { children: true, devices: true },
    });

    if (!room) {
      return NextResponse.json({ error: "空间不存在" }, { status: 404 });
    }

    // 检查是否有子空间
    if (room.children.length > 0) {
      return NextResponse.json(
        { error: "请先删除子空间" },
        { status: 400 }
      );
    }

    // 解绑所有设备
    await prisma.device.updateMany({
      where: { roomId: id },
      data: { roomId: null },
    });

    // 删除空间
    await prisma.room.delete({ where: { id } });

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting room:", error);
    return NextResponse.json({ error: "删除空间失败" }, { status: 500 });
  }
}
