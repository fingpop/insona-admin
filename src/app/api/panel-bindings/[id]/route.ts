import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// PUT — 更换绑定场景
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { sceneId } = body;

    if (!sceneId) {
      return NextResponse.json({ error: "缺少场景ID" }, { status: 400 });
    }

    const binding = await prisma.panelSceneBinding.update({
      where: { id: params.id },
      data: { sceneId },
      include: { scene: true },
    });

    return Response.json({ binding });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as any).code === "P2025") {
      return NextResponse.json({ error: "绑定不存在" }, { status: 404 });
    }
    console.error("Failed to update panel binding:", err);
    return NextResponse.json({ error: "更新绑定失败" }, { status: 500 });
  }
}

// DELETE — 删除绑定
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.panelSceneBinding.delete({
      where: { id: params.id },
    });
    return Response.json({ result: "ok" });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as any).code === "P2025") {
      return NextResponse.json({ error: "绑定不存在" }, { status: 404 });
    }
    console.error("Failed to delete panel binding:", err);
    return NextResponse.json({ error: "删除绑定失败" }, { status: 500 });
  }
}
