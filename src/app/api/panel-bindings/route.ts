import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// GET — 获取所有绑定关系 + 场景列表（用于下拉选择）
export async function GET() {
  try {
    const [bindings, scenes] = await Promise.all([
      prisma.panelSceneBinding.findMany({
        include: { scene: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.scene.findMany({
        orderBy: { name: "asc" },
      }),
    ]);
    return Response.json({ bindings, scenes });
  } catch (err) {
    console.error("Failed to fetch panel bindings:", err);
    return NextResponse.json({ error: "获取绑定列表失败" }, { status: 500 });
  }
}

// POST — 创建新的按键绑定
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { panelDid, buttonIndex, sceneId } = body;

    if (!panelDid || buttonIndex === undefined || buttonIndex === null || !sceneId) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 验证 buttonIndex 范围
    if (typeof buttonIndex !== "number" || buttonIndex < 0 || buttonIndex > 5) {
      return NextResponse.json({ error: "按键索引必须在 0-5 之间" }, { status: 400 });
    }

    // 验证 panelDid 非空字符串
    if (typeof panelDid !== "string" || panelDid.trim().length === 0) {
      return NextResponse.json({ error: "面板 DID 不能为空" }, { status: 400 });
    }

    // 验证 sceneId 存在
    const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) {
      return NextResponse.json({ error: "场景不存在" }, { status: 404 });
    }

    const binding = await prisma.panelSceneBinding.create({
      data: {
        panelDid: panelDid.toUpperCase(),
        buttonIndex: Number(buttonIndex),
        sceneId,
      },
      include: { scene: true },
    });

    return Response.json({ binding });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as any).code === "P2002") {
      return NextResponse.json({ error: "该按键已有绑定" }, { status: 409 });
    }
    console.error("Failed to create panel binding:", err);
    return NextResponse.json({ error: "创建绑定失败" }, { status: 500 });
  }
}
