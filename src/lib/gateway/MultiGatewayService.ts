import { GatewayService } from "./GatewayService";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

type SSEConsumer = (data: string) => void;

class MultiGatewayService {
  private gateways: Map<string, GatewayService> = new Map();
  private sseConsumers: Set<SSEConsumer> = new Set();

  getGateway(gatewayId: string): GatewayService | undefined {
    return this.gateways.get(gatewayId);
  }

  getConnectedGateways(): GatewayService[] {
    return Array.from(this.gateways.values()).filter((gw) => gw.isConnected);
  }

  async connectGateway(gatewayId: string, ip: string, port: number): Promise<void> {
    if (this.gateways.has(gatewayId)) {
      const existing = this.gateways.get(gatewayId)!;
      if (existing.isConnected) {
        throw new Error(`Gateway ${gatewayId} already connected`);
      }
      // Reuse existing instance but reconnect
    }

    // 防止同一网关被并发连接（由 GatewayService.connect() 内部处理）

    let gw = this.gateways.get(gatewayId);
    if (!gw) {
      gw = new GatewayService(gatewayId);
      // Subscribe to this gateway's SSE events and broadcast
      gw.subscribeSSE((data) => {
        const enriched = this._enrichEvent(data, gatewayId);
        this._broadcast(enriched);
      });
      this.gateways.set(gatewayId, gw);
    }

    try {
      await gw.connect(ip, port);
    } finally {
      // _connecting tracking removed, handled by GatewayService
    }
  }

  async disconnectGateway(gatewayId: string): Promise<void> {
    const gw = this.gateways.get(gatewayId);
    if (gw) {
      await gw.disconnect();
    }
  }

  async removeGateway(gatewayId: string): Promise<void> {
    const gw = this.gateways.get(gatewayId);
    if (gw) {
      await gw.disconnect();
      this.gateways.delete(gatewayId);
    }
  }

  subscribeSSE(onData: SSEConsumer): () => void {
    this.sseConsumers.add(onData);
    return () => this.sseConsumers.delete(onData);
  }

  async loadAndConnectAll(): Promise<void> {
    const gateways = await prisma.gateway.findMany({
      orderBy: { createdAt: "asc" },
    });

    for (const gw of gateways) {
      try {
        await this.connectGateway(gw.id, gw.ip, gw.port);
        logger.info("Gateway", `已连接网关 ${gw.name || gw.ip}:${gw.port}`);
      } catch (err) {
        logger.error("Gateway", `网关连接失败 ${gw.ip}:${gw.port}:`, (err as Error).message);
        // 连接状态由 GatewayService 自身管理：
        //   - _doConnect 成功回调 → connected
        //   - _handleDisconnect / _scheduleReconnect → disconnected / reconnecting
        // 这里不覆写 DB status，避免将"已连接"等正常状态误标为 error
      }
    }

    if (gateways.length === 0) {
      logger.info("Gateway", "未配置网关");
    } else {
      logger.info("Gateway", `已加载 ${gateways.length} 个网关`);
    }
  }

  private _enrichEvent(data: string, gatewayId: string): string {
    try {
      // SSE data line format: data: {...}\n\n
      // Extract the JSON part after "data: "
      const jsonStr = data.replace(/^data: /, "").replace(/\n\n$/, "");
      const parsed = JSON.parse(jsonStr);
      return `data: ${JSON.stringify({ ...parsed, gatewayId })}\n\n`;
    } catch {
      // Non-JSON data, wrap with gatewayId
      return `data: ${JSON.stringify({ type: "raw", data, gatewayId })}\n\n`;
    }
  }

  private _broadcast(data: string) {
    for (const consumer of Array.from(this.sseConsumers)) {
      try {
        consumer(data);
      } catch {
        this.sseConsumers.delete(consumer);
      }
    }
  }
}

// Use globalThis to survive Turbopack module re-evaluation in Next.js dev mode
const _global = globalThis as unknown as { __multiGatewayService?: MultiGatewayService }
export const multiGatewayService: MultiGatewayService =
  _global.__multiGatewayService ?? (_global.__multiGatewayService = new MultiGatewayService())
