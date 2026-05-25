/**
 * 后台调度服务 - 在 Next.js 启动时自动运行
 *
 * 每 60 秒检查一次是否有任务需要执行
 */

import { runSchedulerTick } from './SchedulerCore';
import { multiGatewayService } from '@/lib/gateway/MultiGatewayService';
import { prisma } from '@/lib/prisma';

let schedulerInterval: NodeJS.Timeout | null = null;
let deviceAliveRefreshInterval: NodeJS.Timeout | null = null;

const DEVICE_ALIVE_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const EVENT_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const EVENT_RETENTION_DAYS = 7; // Keep events for 7 days

let eventCleanupInterval: NodeJS.Timeout | null = null;

async function cleanupOldEvents() {
  const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.dashboardEvent.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(`[EventCleanup] Deleted ${result.count} events older than ${EVENT_RETENTION_DAYS} days`);
  }
}

async function refreshDeviceAliveForAllGateways() {
  const gateways = multiGatewayService.getConnectedGateways();
  if (gateways.length === 0) return;

  for (const gw of gateways) {
    try {
      const result = await gw.refreshDeviceAlive();
      console.log(`[DeviceAlive] Gateway ${gw.id}: refreshed=${result.refreshed}, online=${result.online}, offline=${result.offline}`);
    } catch (err) {
      console.error(`[DeviceAlive] Gateway ${gw.id} refresh failed:`, (err as Error).message);
    }
  }
}

export function startScheduler() {
  if (schedulerInterval) {
    console.log('[BackgroundScheduler] 调度器已在运行');
    return;
  }

  console.log('[BackgroundScheduler] 启动后台调度服务...');

  // 立即执行一次
  runSchedulerTick().then((result) => {
    console.log(`[BackgroundScheduler] 初始检查完成: executed=${result.executed}, errors=${result.errors}`);
  }).catch((err) => {
    console.error('[BackgroundScheduler] 初始检查失败:', err);
  });

  // 每 60 秒执行一次
  schedulerInterval = setInterval(async () => {
    try {
      const result = await runSchedulerTick();
      if (result.executed > 0 || result.errors > 0) {
        console.log(`[BackgroundScheduler] 定时检查: executed=${result.executed}, errors=${result.errors}, skipped=${result.skipped}`);
      }
    } catch (err) {
      console.error('[BackgroundScheduler] 定时检查失败:', err);
    }
  }, 60_000);

  console.log('[BackgroundScheduler] 调度服务已启动，每 60 秒检查一次');

  // 启动设备在线状态定时刷新
  deviceAliveRefreshInterval = setInterval(async () => {
    try {
      await refreshDeviceAliveForAllGateways();
    } catch (err) {
      console.error('[DeviceAlive] 定时刷新失败:', err);
    }
  }, DEVICE_ALIVE_REFRESH_INTERVAL);

  // 延迟 30 秒执行首次刷新，给网关连接和设备同步留出时间
  setTimeout(() => {
    refreshDeviceAliveForAllGateways().catch((err) => {
      console.error('[DeviceAlive] 首次刷新失败:', err);
    });
  }, 30_000);

  console.log(`[DeviceAlive] 状态刷新已启动，每 ${DEVICE_ALIVE_REFRESH_INTERVAL / 1000} 秒执行一次`);

  // 启动旧事件清理（每小时检查一次，删除 7 天前的事件）
  eventCleanupInterval = setInterval(async () => {
    try {
      await cleanupOldEvents();
    } catch (err) {
      console.error('[EventCleanup] 定时清理失败:', err);
    }
  }, EVENT_CLEANUP_INTERVAL);

  // 启动时立即执行一次清理
  cleanupOldEvents().catch((err) => {
    console.error('[EventCleanup] 初始清理失败:', err);
  });

  console.log(`[EventCleanup] 事件清理已启动，每 ${EVENT_CLEANUP_INTERVAL / 60000} 分钟执行一次，保留 ${EVENT_RETENTION_DAYS} 天`);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[BackgroundScheduler] 调度服务已停止');
  }
  if (deviceAliveRefreshInterval) {
    clearInterval(deviceAliveRefreshInterval);
    deviceAliveRefreshInterval = null;
    console.log('[DeviceAlive] 状态刷新已停止');
  }
  if (eventCleanupInterval) {
    clearInterval(eventCleanupInterval);
    eventCleanupInterval = null;
    console.log('[EventCleanup] 事件清理已停止');
  }
}