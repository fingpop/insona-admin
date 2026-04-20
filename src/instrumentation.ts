/**
 * Next.js Instrumentation Hook
 *
 * 在服务器启动时执行，用于初始化后台服务
 * 文档: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // 只在服务器端运行
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] 服务器启动中...');

    // 动态导入避免客户端打包
    const { startScheduler } = await import('./lib/scheduler/BackgroundScheduler');
    startScheduler();

    // 多网关自动连接（非阻塞，失败不影响服务器启动）
    const { multiGatewayService } = await import('./lib/gateway/MultiGatewayService');
    multiGatewayService.loadAndConnectAll();

    console.log('[Instrumentation] 后台服务已启动');
  }
}
