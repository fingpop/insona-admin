import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = Promise<{ id: string; actionId: string }>;

// 删除场景动作
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { actionId } = await params;

  try {
    await prisma.sceneAction.delete({ where: { id: actionId } });
    return Response.json({ success: true });
  } catch (err) {
    console.error("Failed to delete action:", err);
    return NextResponse.json({ error: "删除动作失败" }, { status: 500 });
  }
}
