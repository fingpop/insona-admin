/**
 * Gateway auto-connect utility
 *
 * Called from instrumentation.ts on server startup.
 * Reads GATEWAY_IP / GATEWAY_PORT from environment and connects.
 * All errors are caught so server startup is never blocked.
 */

export async function tryConnectGateway(): Promise<void> {
  const gatewayIp = process.env.GATEWAY_IP;

  if (!gatewayIp) {
    console.warn('[Instrumentation] GATEWAY_IP 未配置，跳过网关连接');
    return;
  }

  const gatewayPort = parseInt(process.env.GATEWAY_PORT || '8091', 10);

  console.log(`[Instrumentation] 正在连接网关 ${gatewayIp}:${gatewayPort}`);

  try {
    const { gatewayService } = await import('@/lib/gateway/GatewayService');
    await gatewayService.connect(gatewayIp, gatewayPort);
    console.log(`[Instrumentation] 网关连接成功: ${gatewayIp}:${gatewayPort}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Instrumentation] 网关连接失败: ${message}`);
  }
}
