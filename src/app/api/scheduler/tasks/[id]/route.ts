import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNextRun } from "@/lib/scheduler/SchedulerCore";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

// GET - 获取单个任务
export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const task = await prisma.scheduledTask.findUnique({
      where: { id },
      include: {
        device: { select: { id: true, name: true, type: true, meshId: true, func: true } },
        scene: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    return NextResponse.json({
      task: {
        ...task,
        nextRun: task.nextRun ? task.nextRun.toISOString() : getNextRun(task.cronExpr).toISOString(),
        lastRun: task.lastRun?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error("[Scheduler] Get task failed:", err);
    return NextResponse.json({ error: "获取任务失败" }, { status: 500 });
  }
}

// PUT - 更新任务
export async function PUT(request: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, deviceId, sceneId, cronExpr, action, value, enabled } = body;

    // 检查任务是否存在
    const existing = await prisma.scheduledTask.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (name !== undefined) updateData.name = name;
    if (cronExpr !== undefined) {
      // 校验 cron 格式
      const parts = cronExpr.trim().split(/\s+/);
      if (parts.length !== 5) {
        return NextResponse.json({ error: "Cron 表达式格式错误" }, { status: 400 });
      }
      updateData.cronExpr = cronExpr;
      updateData.nextRun = getNextRun(cronExpr);
    }
    if (action !== undefined) updateData.action = action;
    if (value !== undefined) updateData.value = JSON.stringify(value);
    if (enabled !== undefined) updateData.enabled = enabled;

    // deviceId/sceneId 允许设为 null（用 undefined 判断）
    if ("deviceId" in body) {
      updateData.deviceId = deviceId || null;
    }
    if ("sceneId" in body) {
      updateData.sceneId = sceneId || null;
    }

    const task = await prisma.scheduledTask.update({
      where: { id },
      data: updateData,
      include: {
        device: { select: { id: true, name: true, type: true, meshId: true, func: true } },
        scene: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      task: {
        ...task,
        nextRun: task.nextRun ? task.nextRun.toISOString() : getNextRun(task.cronExpr).toISOString(),
        lastRun: task.lastRun?.toISOString() ?? null,
      },
    });
  } catch (err) {
    console.error("[Scheduler] Update task failed:", err);
    return NextResponse.json({ error: "更新任务失败" }, { status: 500 });
  }
}

// DELETE - 删除任务
export async function DELETE(_req: Request, { params }: { params: Params }) {
  try {
    const { id } = await params;
    await prisma.scheduledTask.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Scheduler] Delete task failed:", err);
    return NextResponse.json({ error: "删除任务失败" }, { status: 500 });
  }
}
