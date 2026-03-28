import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNextRun } from "@/lib/scheduler/SchedulerCore";

export const runtime = "nodejs";

// GET - 获取所有定时任务
export async function GET() {
  const tasks = await prisma.scheduledTask.findMany({
    include: {
      device: { select: { id: true, name: true, type: true, meshId: true, func: true } },
      scene: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // 补全 nextRun
  const tasksWithNextRun = tasks.map((t) => ({
    ...t,
    nextRun: t.nextRun ?? getNextRun(t.cronExpr).toISOString(),
    lastRun: t.lastRun?.toISOString() ?? null,
  }));

  return NextResponse.json({ tasks: tasksWithNextRun });
}

// POST - 创建任务
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, deviceId, sceneId, cronExpr, action, value } = body;

    if (!name || !cronExpr || !action) {
      return NextResponse.json({ error: "缺少必填字段: name, cronExpr, action" }, { status: 400 });
    }

    // 校验 cron 表达式格式（5段）
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) {
      return NextResponse.json(
        { error: "Cron 表达式格式错误，应为 5 段（分 时 日 月 周）" },
        { status: 400 }
      );
    }

    // 校验任务类型
    const validActions = ["onoff", "level", "scene", "curtain", "ctl", "color"];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `无效的 action 类型，可选值: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    // 校验设备和场景不能同时为空或同时有值
    if (!deviceId && !sceneId) {
      return NextResponse.json({ error: "必须指定 deviceId 或 sceneId" }, { status: 400 });
    }

    // 校验场景存在
    if (sceneId) {
      const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
      if (!scene) {
        return NextResponse.json({ error: "指定的场景不存在" }, { status: 400 });
      }
    }

    // 校验设备存在
    if (deviceId) {
      const device = await prisma.device.findUnique({ where: { id: deviceId } });
      if (!device) {
        return NextResponse.json({ error: "指定的设备不存在" }, { status: 400 });
      }
    }

    const nextRun = getNextRun(cronExpr);

    const task = await prisma.scheduledTask.create({
      data: {
        name,
        deviceId: deviceId || null,
        sceneId: sceneId || null,
        cronExpr,
        action,
        value: value ? JSON.stringify(value) : "[]",
        enabled: true,
        nextRun,
      },
      include: {
        device: { select: { id: true, name: true, type: true, meshId: true, func: true } },
        scene: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(
      {
        task: {
          ...task,
          nextRun: task.nextRun?.toISOString(),
          lastRun: task.lastRun?.toISOString() ?? null,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[Scheduler] Create task failed:", err);
    return NextResponse.json({ error: "创建任务失败" }, { status: 500 });
  }
}
