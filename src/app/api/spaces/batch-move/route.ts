import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 批量移动空间到新的父级
export async function POST(request: Request) {
  try {
    const { spaceIds, targetParentId } = await request.json();

    if (!Array.isArray(spaceIds) || spaceIds.length === 0) {
      return NextResponse.json({ error: "未选择任何空间" }, { status: 400 });
    }

    // 验证目标父级
    if (targetParentId) {
      const parent = await prisma.room.findUnique({ where: { id: targetParentId } });
      if (!parent) {
        return NextResponse.json({ error: "目标父级空间不存在" }, { status: 400 });
      }
    }

    // 更新所有选中空间的父级
    await prisma.room.updateMany({
      where: { id: { in: spaceIds } },
      data: { parentId: targetParentId || null },
    });

    return NextResponse.json({ success: true, count: spaceIds.length });
  } catch (err) {
    console.error("[BatchMoveSpaces]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "批量移动失败" },
      { status: 500 }
    );
  }
}
