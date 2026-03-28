import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/prisma";
import { gatewayService } from "@/lib/gateway/GatewayService";

// 防重复执行：使用 globalThis 缓存上次执行时间戳
declare global {
  // eslint-disable-next-line no-var
  var __schedulerLastTick: number | undefined;
  // eslint-disable-next-line no-var
  var __schedulerLock: boolean | undefined;
}
if (typeof globalThis.__schedulerLastTick === "undefined") {
  globalThis.__schedulerLastTick = 0;
}

/** 计算下一次执行时间 */
export function getNextRun(cronExpr: string, from: Date = new Date()): Date {
  try {
    const expr = CronExpressionParser.parse(cronExpr, { currentDate: from });
    return expr.next().toDate();
  } catch {
    return from;
  }
}

/** 判断 cron 表达式是否应该在当前分钟执行 */
function shouldRunNow(cronExpr: string, lastRun: Date | null, now: Date): boolean {
  try {
    const expr = CronExpressionParser.parse(cronExpr, { currentDate: now });

    // 获取当前时间的上一个执行点
    const prev = expr.prev().toDate();
    const diffMs = now.getTime() - prev.getTime();

    console.log(`[Scheduler] shouldRunNow: prev=${prev.toISOString()}, now=${now.toISOString()}, diffMs=${diffMs}`);

    // 如果上一个执行点在 60 秒内，且上次运行不是这一分钟，则执行
    // diffMs >= 0 确保是过去的执行点
    // diffMs < 60000 确保在当前分钟内
    if (diffMs >= 0 && diffMs < 60_000) {
      // 检查 lastRun 是否已经执行过这一分钟
      if (lastRun) {
        const lastRunMinute = new Date(lastRun).getTime();
        // 如果上次执行时间距离这个执行点超过 30 秒，说明还没执行
        const timeSinceLastRun = prev.getTime() - lastRunMinute;
        console.log(`[Scheduler] lastRun=${new Date(lastRun).toISOString()}, timeSinceLastRun=${timeSinceLastRun}`);
        if (timeSinceLastRun < 30_000 && timeSinceLastRun > -30_000) {
          // 已经在这一分钟执行过了
          console.log(`[Scheduler] 任务已在本次执行窗口执行过，跳过`);
          return false;
        }
      }
      console.log(`[Scheduler] 任务应该执行`);
      return true;
    }

    console.log(`[Scheduler] 任务不在执行窗口内`);
    return false;
  } catch (err) {
    console.error(`[Scheduler] 解析 cron 表达式失败:`, err);
    return false;
  }
}

/** 解析 value 为 number[]（兼容字符串和数组，处理双重序列化） */
function parseValue(value: unknown): number[] {
  // 如果已经是 number[] 直接返回
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "number" ? v : parseFloat(String(v)))).filter((n) => !isNaN(n));
  }

  // 如果是字符串，尝试 JSON 解析
  if (typeof value === "string") {
    let parsed: unknown = value;

    // 循环解析，处理双重序列化如 "\"[0]\"" -> "[0]" -> [0]
    while (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        break;
      }
    }

    // 如果解析后是数组
    if (Array.isArray(parsed)) {
      return parsed.map((v) => (typeof v === "number" ? v : parseFloat(String(v)))).filter((n) => !isNaN(n));
    }

    // 如果解析后是数字
    if (typeof parsed === "number") {
      return [parsed];
    }

    // 兼容旧格式 "50" 或 "1,50"
    const parts = value.split(",").map((p) => parseFloat(p.trim()));
    return parts.filter((n) => !isNaN(n));
  }

  // 如果是数字
  if (typeof value === "number") {
    return [value];
  }

  return [];
}

/** 执行单个任务 */
async function executeTask(
  task: {
    id: string;
    name: string;
    deviceId: string | null;
    sceneId: string | null;
    cronExpr: string;
    action: string;
    value: string;
    device: { id: string; meshId: string | null; func: number } | null;
    scene: { id: string; name: string } | null;
  }
): Promise<void> {
  console.log(`[Scheduler] 执行任务: "${task.name}" (${task.id})`);

  try {
    if (!gatewayService.isConnected) {
      console.error("[Scheduler] 网关未连接，跳过执行");
      return;
    }

    if (task.action === "scene" && task.sceneId) {
      // 场景激活：直接调用已有的场景激活逻辑
      // 从数据库加载场景
      const scene = await prisma.scene.findUnique({
        where: { id: task.sceneId },
        include: { actions: { orderBy: { order: "asc" } } },
      });

      if (!scene) {
        console.error(`[Scheduler] 场景不存在: ${task.sceneId}`);
        return;
      }

      console.log(`[Scheduler] 执行场景 "${scene.name}"，包含 ${scene.actions.length} 个动作`);

      // 按 mesh 分组执行
      const byMesh = new Map<string, typeof scene.actions>();
      for (const a of scene.actions) {
        if (!byMesh.has(a.meshId)) byMesh.set(a.meshId, []);
        byMesh.get(a.meshId)!.push(a);
      }

      for (const [meshId, actions] of byMesh) {
        for (const sa of actions) {
          // 解析 value（兼容字符串和数组）
          console.log(`[Scheduler] SceneAction raw value: ${JSON.stringify(sa.value)}, type: ${typeof sa.value}`);
          const parsedValue = parseValue(sa.value);
          console.log(`[Scheduler] parsed value: ${JSON.stringify(parsedValue)}`);
          // 兼容 cct 旧格式
          const act = sa.action === "cct" ? "ctl" : sa.action;

          console.log(`[Scheduler] 控制设备 ${sa.deviceId}, action=${act}, value=${JSON.stringify(parsedValue)}`);
          await gatewayService.controlDevice(sa.deviceId, act, parsedValue, meshId, 0, 2000);
        }
      }
    } else if (task.deviceId && task.device) {
      // 设备控制
      const meshId = task.device.meshId || "";
      const parsedValue = parseValue(task.value);

      console.log(`[Scheduler] 控制设备 ${task.deviceId}, action=${task.action}, value=${JSON.stringify(parsedValue)}`);
      await gatewayService.controlDevice(task.deviceId, task.action, parsedValue, meshId);

      // 更新本地设备状态（忽略组设备的错误）
      await prisma.device
        .update({
          where: { id: task.deviceId },
          data: { value: task.value },
        })
        .catch(() => {});
    } else {
      console.error(`[Scheduler] 任务配置无效: ${task.id}`);
      return;
    }

    // 更新执行时间
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

/** 主入口：检查并执行所有到期的任务 */
export async function runSchedulerTick(): Promise<{ executed: number; errors: number; skipped: boolean }> {
  const now = Date.now();

  // 防重复执行：同分钟内跳过
  if (now - (globalThis.__schedulerLastTick ?? 0) < 55_000) {
    console.log('[Scheduler] 跳过本次 tick（同一分钟内）');
    return { executed: 0, errors: 0, skipped: true };
  }

  globalThis.__schedulerLastTick = now;

  console.log('[Scheduler] 开始检查定时任务...');

  // 检查网关连接状态，如果内存状态是断开但数据库是连接，尝试恢复
  let connected = gatewayService.isConnected;
  const status = gatewayService.status;
  console.log(`[Scheduler] 网关内存状态: status=${status}, isConnected=${connected}`);

  if (!connected) {
    // 尝试从数据库恢复连接
    const gateway = await prisma.gateway.findUnique({ where: { id: "default" } });
    console.log(`[Scheduler] 数据库网关状态: status=${gateway?.status}, ip=${gateway?.ip}`);

    if (gateway && gateway.status === "connected" && gateway.ip) {
      console.log(`[Scheduler] 尝试恢复网关连接: ${gateway.ip}:${gateway.port}`);
      try {
        await gatewayService.connect(gateway.ip, gateway.port);
        connected = true;
        console.log("[Scheduler] 网关连接恢复成功");
      } catch (err) {
        console.error("[Scheduler] 网关连接恢复失败:", err);
      }
    }
  }

  if (!connected) {
    console.log("[Scheduler] 网关未连接，跳过本次 tick");
    return { executed: 0, errors: 0, skipped: false };
  }

  const nowDate = new Date();
  const tasks = await prisma.scheduledTask.findMany({
    where: { enabled: true },
    include: {
      device: { select: { id: true, meshId: true, func: true } },
      scene: { select: { id: true, name: true } },
    },
  });

  console.log(`[Scheduler] 找到 ${tasks.length} 个启用的任务`);

  let executed = 0;
  let errors = 0;

  for (const task of tasks) {
    const shouldRun = shouldRunNow(task.cronExpr, task.lastRun, nowDate);
    console.log(`[Scheduler] 任务 "${task.name}" cron="${task.cronExpr}" shouldRun=${shouldRun} lastRun=${task.lastRun?.toISOString() || 'null'}`);

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

/** 立即执行单个任务（忽略 cron 时间检查） */
export async function runTaskNow(taskId: string): Promise<{ success: boolean; error?: string }> {
  console.log(`[Scheduler] 立即执行任务: ${taskId}`);

  // 检查并恢复网关连接
  let connected = gatewayService.isConnected;
  if (!connected) {
    const gateway = await prisma.gateway.findUnique({ where: { id: "default" } });
    if (gateway && gateway.status === "connected" && gateway.ip) {
      console.log(`[Scheduler] 恢复网关连接: ${gateway.ip}:${gateway.port}`);
      try {
        await gatewayService.connect(gateway.ip, gateway.port);
        connected = true;
      } catch (err) {
        console.error("[Scheduler] 网关连接失败:", err);
      }
    }
  }

  if (!connected) {
    console.error("[Scheduler] 网关未连接，无法执行");
    return { success: false, error: "网关未连接" };
  }

  try {
    const task = await prisma.scheduledTask.findUnique({
      where: { id: taskId },
      include: {
        device: { select: { id: true, meshId: true, func: true } },
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

/** Cron 表达式描述文本 */
export function describeCron(cronExpr: string): string {
  try {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5) return cronExpr;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // 解析时间
    const timeStr =
      hour !== "*" && minute !== "*" ? `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` : null;

    // 解析日期
    if (dayOfWeek !== "*" && dayOfWeek !== "?") {
      const days = dayOfWeek.split(",").map((d) => {
        const dayNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        return dayNames[parseInt(d)] || d;
      });
      if (timeStr) {
        return `每${days.join("/")} ${timeStr}`;
      }
      return `每${days.join("/")}`;
    }

    if (dayOfMonth !== "*" && dayOfMonth !== "?") {
      if (timeStr) {
        return `每月 ${dayOfMonth}日 ${timeStr}`;
      }
      return `每月 ${dayOfMonth}日`;
    }

    if (timeStr) {
      return `每天 ${timeStr}`;
    }

    return cronExpr;
  } catch {
    return cronExpr;
  }
}

/** 时间选择转换为 Cron 表达式 */
export function timeToCron(time: string, days: "daily" | "weekdays" | "weekends" | "weekly" = "daily", dayOfWeek?: number): string {
  const [hour, minute] = time.split(":").map(Number);

  if (days === "weekdays") {
    // 周一到周五
    return `${minute} ${hour} * * 1-5`;
  }

  if (days === "weekends") {
    // 周六周日
    return `${minute} ${hour} * * 0,6`;
  }

  if (days === "weekly" && dayOfWeek !== undefined) {
    // 每周某天
    return `${minute} ${hour} * * ${dayOfWeek}`;
  }

  // 每天
  return `${minute} ${hour} * * *`;
}
