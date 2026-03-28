import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

// 添加场景动作
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { deviceId, action, value, meshId, deviceName } = body;

    if (!deviceId || !action) {
      return NextResponse.json({ error: "设备ID和动作不能为空" }, { status: 400 });
    }

    // 获取当前场景的最大 order
    const maxOrder = await prisma.sceneAction.aggregate({
      where: { sceneId: id },
      _max: { order: true },
    });

    const sceneAction = await prisma.sceneAction.create({
      data: {
        sceneId: id,
        deviceId,
        action,
        value: JSON.stringify(value ?? []),
        meshId: meshId || "",
        deviceName: deviceName || "",
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });

    return Response.json({ action: sceneAction });
  } catch (err) {
    console.error("Failed to add action:", err);
    return NextResponse.json({ error: "添加动作失败" }, { status: 500 });
  }
}

// 批量添加场景动作
export async function PUT(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { actions } = body;

    if (!Array.isArray(actions)) {
      return NextResponse.json({ error: "无效的动作数据" }, { status: 400 });
    }

    // 删除现有动作
    await prisma.sceneAction.deleteMany({ where: { sceneId: id } });

    // 批量创建新动作
    const createdActions = await prisma.sceneAction.createMany({
      data: actions.map((a: { deviceId: string; action: string; value: number[]; meshId: string; deviceName?: string }, index: number) => ({
        sceneId: id,
        deviceId: a.deviceId,
        action: a.action,
        value: JSON.stringify(a.value ?? []),
        meshId: a.meshId || "",
        deviceName: a.deviceName || "",
        order: index,
      })),
    });

    return Response.json({ count: createdActions.count });
  } catch (err) {
    console.error("Failed to update actions:", err);
    return NextResponse.json({ error: "更新动作失败" }, { status: 500 });
  }
}
