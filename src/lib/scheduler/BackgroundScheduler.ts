/**
 * 后台调度服务 - 在 Next.js 启动时自动运行
 *
 * 每 60 秒检查一次是否有任务需要执行
 */

import { runSchedulerTick } from './SchedulerCore';

let schedulerInterval: NodeJS.Timeout | null = null;

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
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[BackgroundScheduler] 调度服务已停止');
  }
}