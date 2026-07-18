/**
 * Next.js Instrumentation Hook
 *
 * 在服务器启动时执行，用于初始化后台服务
 * 文档: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // 只在服务器端运行
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 动态导入 logger（避免在模块顶层引入导致循环依赖）
    const { logger } = await import('./lib/logger');
    logger.info("System", "服务器启动中...");

    // 动态导入避免客户端打包
    const { startScheduler } = await import('./lib/scheduler/BackgroundScheduler');
    startScheduler();

    // 多网关自动连接（非阻塞，失败不影响服务器启动）
    const { multiGatewayService } = await import('./lib/gateway/MultiGatewayService');
    multiGatewayService.loadAndConnectAll().catch((err) => {
      logger.error("System", "网关自动连接失败:", err);
    });

    // 读取版本信息
    try {
      const fs = await import('fs');
      const path = await import('path');
      const verPath = path.join(process.cwd(), 'VERSION');
      const version = fs.existsSync(verPath) ? fs.readFileSync(verPath, 'utf-8').trim() : 'unknown';
      logger.info("System", `版本 ${version} 已就绪（${process.env.NODE_ENV || 'development'}）`);
    } catch {
      logger.info("System", "服务已就绪");
    }
  }
}
