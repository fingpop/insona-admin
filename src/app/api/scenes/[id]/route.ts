import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

// 获取单个场景
export async function GET(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    const scene = await prisma.scene.findUnique({
      where: { id },
      include: { actions: { orderBy: { order: "asc" } } },
    });

    if (!scene) {
      return NextResponse.json({ error: "场景不存在" }, { status: 404 });
    }

    return Response.json({ scene });
  } catch (err) {
    console.error("Failed to fetch scene:", err);
    return NextResponse.json({ error: "获取场景失败" }, { status: 500 });
  }
}

// 更新场景（支持同时更新 actions）
export async function PUT(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, icon, color, meshId, isCustom, showInQuick, actions } = body;

    const scene = await prisma.$transaction(async (tx) => {
      const updated = await tx.scene.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(icon !== undefined && { icon }),
          ...(color !== undefined && { color }),
          ...(meshId !== undefined && { meshId }),
          ...(isCustom !== undefined && { isCustom }),
          ...(showInQuick !== undefined && { showInQuick }),
        },
        include: { actions: { orderBy: { order: "asc" } } },
      });

      // 如果传入了 actions，替换所有动作
      if (Array.isArray(actions)) {
        await tx.sceneAction.deleteMany({ where: { sceneId: id } });
        if (actions.length > 0) {
          await tx.sceneAction.createMany({
            data: actions.map((a: { deviceId: string; action: string; value: string; meshId: string; deviceName?: string }, index: number) => ({
              sceneId: id,
              deviceId: a.deviceId,
              action: a.action,
              value: a.value ?? "[]",
              meshId: a.meshId || "",
              deviceName: a.deviceName || "",
              order: index,
            })),
          });
        }
      }

      return updated;
    });

    return Response.json({ scene });
  } catch (err) {
    console.error("Failed to update scene:", err);
    return NextResponse.json({ error: "更新场景失败" }, { status: 500 });
  }
}

// 删除场景
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    // 删除场景会级联删除关联的动作
    await prisma.scene.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    console.error("Failed to delete scene:", err);
    return NextResponse.json({ error: "删除场景失败" }, { status: 500 });
  }
}
