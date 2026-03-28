import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取空间列表
export async function GET() {
  try {
    const rooms = await prisma.room.findMany({
      include: {
        children: {
          include: {
            children: {
              include: {
                _count: { select: { devices: true } },
                devices: { where: { alive: 1 }, select: { id: true } },
              },
            },
            _count: { select: { devices: true } },
            devices: { where: { alive: 1 }, select: { id: true } },
          },
        },
        _count: { select: { devices: true } },
        devices: { where: { alive: 1 }, select: { id: true } },
      },
      where: { parentId: null },
      orderBy: { name: "asc" },
    });

    return Response.json({ rooms });
  } catch (error) {
    console.error("Error fetching rooms:", error);
    return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 });
  }
}

// 创建空间
export async function POST(request: Request) {
  try {
    const { name, type, parentId, meshId } = await request.json();

    if (!name) {
      return NextResponse.json({ error: "名称不能为空" }, { status: 400 });
    }

    if (parentId) {
      const parent = await prisma.room.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ error: "父级空间不存在" }, { status: 400 });
      }
    }

    const room = await prisma.room.create({
      data: {
        name,
        type: type || "room",
        parentId: parentId || null,
        meshId,
      },
    });

    return Response.json({ room });
  } catch (error) {
    console.error("Error creating room:", error);
    return NextResponse.json({ error: "创建空间失败" }, { status: 500 });
  }
}
