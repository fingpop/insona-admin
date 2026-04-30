import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取所有场景（包含动作）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const quick = searchParams.get("quick") === "true";

    const where = quick ? { showInQuick: true } : {};

    const scenes = await prisma.scene.findMany({
      where,
      include: {
        actions: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: [
        { isDefault: "desc" },
        { createdAt: "asc" },
      ],
    });

    return Response.json({ scenes });
  } catch (err) {
    console.error("Failed to fetch scenes:", err);
    return NextResponse.json({ error: "获取场景列表失败" }, { status: 500 });
  }
}

// 创建新场景（支持同时传入 actions）
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, icon, color, isCustom, meshId, showInQuick, actions } = body;

    if (!name) {
      return NextResponse.json({ error: "场景名称不能为空" }, { status: 400 });
    }

    const scene = await prisma.scene.create({
      data: {
        name,
        icon: icon || "fa-star",
        color: color || "#3b9eff",
        isDefault: false,
        isCustom: isCustom ?? true,
        showInQuick: showInQuick ?? false,
        meshId: meshId || null,
        ...(actions?.length > 0 && {
          actions: {
            create: actions.map((a: { deviceId: string; action: string; value: string; meshId: string; deviceName?: string }, index: number) => ({
              deviceId: a.deviceId,
              action: a.action,
              value: a.value ?? "[]",
              meshId: a.meshId || "",
              deviceName: a.deviceName || "",
              order: index,
            })),
          },
        }),
      },
      include: { actions: true },
    });

    return Response.json({ scene });
  } catch (err) {
    console.error("Failed to create scene:", err);
    return NextResponse.json({ error: "创建场景失败" }, { status: 500 });
  }
}
