import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/prisma";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { parseStoredDeviceId } from "@/lib/types";

declare global {
  var __schedulerLastTick: number | undefined;
  var __schedulerLock: boolean | undefined;
}
if (typeof globalThis.__schedulerLastTick === "undefined") {
  globalThis.__schedulerLastTick = 0;
}

export function getNextRun(cronExpr: string, from: Date = new Date()): Date {
  try {
    const expr = CronExpressionParser.parse(cronExpr, { currentDate: from });
    return expr.next().toDate();
  } catch {
    return from;
  }
}

function shouldRunNow(cronExpr: string, lastRun: Date | null, now: Date): boolean {
  try {
    const expr = CronExpressionParser.parse(cronExpr, { currentDate: now });
    const prev = expr.prev().toDate();
    const diffMs = now.getTime() - prev.getTime();

    if (diffMs >= 0 && diffMs < 60_000) {
      if (lastRun) {
        const lastRunMinute = new Date(lastRun).getTime();
        const timeSinceLastRun = prev.getTime() - lastRunMinute;
        if (timeSinceLastRun < 30_000 && timeSinceLastRun > -30_000) {
          return false;
        }
      }
      return true;
    }
    return false;
  } catch (err) {
    console.error(`[Scheduler] 解析 cron 表达式失败:`, err);
    return false;
  }
}

function parseValue(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "number" ? v : parseFloat(String(v)))).filter((n) => !isNaN(n));
  }
  if (typeof value === "string") {
    let parsed: unknown = value;
    while (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch { break; }
    }
    if (Array.isArray(parsed)) {
      return parsed.map((v) => (typeof v === "number" ? v : parseFloat(String(v)))).filter((n) => !isNaN(n));
    }
    if (typeof parsed === "number") return [parsed];
    const parts = value.split(",").map((p) => parseFloat(p.trim()));
    return parts.filter((n) => !isNaN(n));
  }
  if (typeof value === "number") return [value];
  return [];
}

async function executeTask(
  task: {
    id: string;
    name: string;
    deviceId: string | null;
    sceneId: string | null;
    cronExpr: string;
    action: string;
    value: string;
    device: { id: string; meshId: string | null; func: number; gatewayId: string | null } | null;
    scene: { id: string; name: string } | null;
  }
): Promise<void> {
  console.log(`[Scheduler] 执行任务: "${task.name}" (${task.id})`);

  try {
    if (task.action === "scene" && task.sceneId) {
      const scene = await prisma.scene.findUnique({
        where: { id: task.sceneId },
        include: { actions: { orderBy: { order: "asc" } } },
      });

      if (!scene) {
        console.error(`[Scheduler] 场景不存在: ${task.sceneId}`);
        return;
      }

      console.log(`[Scheduler] 执行场景 "${scene.name}"，包含 ${scene.actions.length} 个动作`);

      const byMesh = new Map<string, typeof scene.actions>();
      for (const a of scene.actions) {
        if (!byMesh.has(a.meshId)) byMesh.set(a.meshId, []);
        byMesh.get(a.meshId)!.push(a);
      }

      for (const [meshId, actions] of byMesh) {
        for (const sa of actions) {
          const parsedValue = parseValue(sa.value);
          const act = sa.action === "cct" ? "ctl" : sa.action;

          // Route to correct gateway via device's gatewayId
          let gw: ReturnType<typeof multiGatewayService.getGateway>;
          if (sa.gatewayId) {
            gw = multiGatewayService.getGateway(sa.gatewayId);
          } else {
            // Fallback: use any connected gateway
            const connected = multiGatewayService.getConnectedGateways();
            gw = connected[0];
          }

          if (!gw?.isConnected) {
            console.error(`[Scheduler] Gateway not connected for scene action on device ${sa.deviceId}`);
            continue;
          }

          // 解析复合 ID（组设备存储为 meshId:did，需要还原原始 did）
          const { did: controlDid } = parseStoredDeviceId(sa.deviceId);
          await gw.controlDevice(controlDid, act, parsedValue, meshId, 0, 2000);
        }
      }
    } else if (task.deviceId && task.device) {
      const meshId = task.device.meshId || "";
      const parsedValue = parseValue(task.value);

      // Route to correct gateway via device's gatewayId
      const gw = task.device.gatewayId
        ? multiGatewayService.getGateway(task.device.gatewayId)
        : undefined;

      if (!gw?.isConnected) {
        console.error(`[Scheduler] Gateway not connected for device ${task.deviceId}`);
        return;
      }

      // 解析复合 ID（组设备存储为 meshId:did，需要还原原始 did）
      const { did: controlDid } = parseStoredDeviceId(task.deviceId);
      await gw.controlDevice(controlDid, task.action, parsedValue, meshId);

      await prisma.device
        .update({ where: { id: task.deviceId }, data: { value: task.value } })
        .catch(() => {});
    } else {
      console.error(`[Scheduler] 任务配置无效: ${task.id}`);
      return;
    }

    const nextRun = getNextRun(task.cronExpr);
    await prisma.scheduledTask.update({
      where: { id: task.id },
      data: { lastRun: new Date(), nextRun },
    });

    console.log(`[Scheduler] 任务完成: "${task.name}"`);
  } catch (err) {
    console.error(`[Scheduler] 任务执行失败: "${task.name}"`, err);
  }
}

export async function runSchedulerTick(): Promise<{ executed: number; errors: number; skipped: boolean }> {
  const now = Date.now();

  if (now - (globalThis.__schedulerLastTick ?? 0) < 55_000) {
    console.log('[Scheduler] 跳过本次 tick（同一分钟内）');
    return { executed: 0, errors: 0, skipped: true };
  }

  globalThis.__schedulerLastTick = now;
  console.log('[Scheduler] 开始检查定时任务...');

  const connectedGateways = multiGatewayService.getConnectedGateways();
  if (connectedGateways.length === 0) {
    console.log("[Scheduler] 无已连接网关，跳过本次 tick");
    return { executed: 0, errors: 0, skipped: false };
  }

  const nowDate = new Date();
  const tasks = await prisma.scheduledTask.findMany({
    where: { enabled: true },
    include: {
      device: { select: { id: true, meshId: true, func: true, gatewayId: true } },
      scene: { select: { id: true, name: true } },
    },
  });

  console.log(`[Scheduler] 找到 ${tasks.length} 个启用的任务`);

  let executed = 0;
  let errors = 0;

  for (const task of tasks) {
    const shouldRun = shouldRunNow(task.cronExpr, task.lastRun, nowDate);
    if (shouldRun) {
      try {
        await executeTask(task);
        executed++;
      } catch (err) {
        console.error(`[Scheduler] 任务执行异常:`, err);
        errors++;
      }
    }
  }

  console.log(`[Scheduler] 检查完成: executed=${executed}, errors=${errors}`);
  return { executed, errors, skipped: false };
}

export async function runTaskNow(taskId: string): Promise<{ success: boolean; error?: string }> {
  console.log(`[Scheduler] 立即执行任务: ${taskId}`);

  const connectedGateways = multiGatewayService.getConnectedGateways();
  if (connectedGateways.length === 0) {
    console.error("[Scheduler] 无已连接网关");
    return { success: false, error: "网关未连接" };
  }

  try {
    const task = await prisma.scheduledTask.findUnique({
      where: { id: taskId },
      include: {
        device: { select: { id: true, meshId: true, func: true, gatewayId: true } },
        scene: { select: { id: true, name: true } },
      },
    });

    if (!task) {
      return { success: false, error: "任务不存在" };
    }

    await executeTask(task);
    return { success: true };
  } catch (err) {
    console.error("[Scheduler] 立即执行失败:", err);
    return { success: false, error: String(err) };
  }
}

export function describeCron(cronExpr: string): string {
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return cronExpr;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const timeStr = hour !== "*" && minute !== "*" ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` : null;

    if (dayOfWeek !== "*" && dayOfWeek !== "?") {
      const days = dayOfWeek.split(",").map((d) => {
        const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        return dayNames[parseInt(d)] || d;
      });
      if (timeStr) return `每${days.join("/")} ${timeStr}`;
      return `每${days.join("/")}`;
    }

    if (dayOfMonth !== "*" && dayOfMonth !== "?") {
      if (timeStr) return `每月 ${dayOfMonth}日 ${timeStr}`;
      return `每月 ${dayOfMonth}日`;
    }

    if (timeStr) return `每天 ${timeStr}`;
    return cronExpr;
  } catch {
    return cronExpr;
  }
}

export function timeToCron(time: string, days: "daily" | "weekdays" | "weekends" | "weekly" = "daily", dayOfWeek?: number): string {
  const [hour, minute] = time.split(":").map(Number);

  if (days === "weekdays") return `${minute} ${hour} * * 1-5`;
  if (days === "weekends") return `${minute} ${hour} * * 0,6`;
  if (days === "weekly" && dayOfWeek !== undefined) return `${minute} ${hour} * * ${dayOfWeek}`;

  return `${minute} ${hour} * * *`;
}
