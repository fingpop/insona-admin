import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

// POST - 启用/禁用切换
export async function POST(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const task = await prisma.scheduledTask.findUnique({ where: { id } });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const updated = await prisma.scheduledTask.update({
      where: { id },
      data: { enabled: !task.enabled },
    });

    return NextResponse.json({ enabled: updated.enabled });
  } catch (err) {
    console.error("[Scheduler] Toggle task failed:", err);
    return NextResponse.json({ error: "切换状态失败" }, { status: 500 });
  }
}
