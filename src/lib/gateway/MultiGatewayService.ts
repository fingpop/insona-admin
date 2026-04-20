import { GatewayService } from "./GatewayService";
import { prisma } from "@/lib/prisma";

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

    await gw.connect(ip, port);
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
        console.log(`[MultiGateway] Connected to ${gw.name || gw.ip}:${gw.port}`);
      } catch (err) {
        console.error(`[MultiGateway] Failed to connect ${gw.ip}:${gw.port}:`, (err as Error).message);
        await prisma.gateway
          .update({
            where: { id: gw.id },
            data: { status: "error" },
          })
          .catch(() => {});
      }
    }

    if (gateways.length === 0) {
      console.log("[MultiGateway] No gateways configured");
    } else {
      console.log(`[MultiGateway] Loaded ${gateways.length} gateway(s)`);
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

export const multiGatewayService = new MultiGatewayService();
