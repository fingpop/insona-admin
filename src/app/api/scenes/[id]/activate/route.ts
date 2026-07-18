import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { parseStoredDeviceId } from "@/lib/types";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    const scene = await prisma.scene.findUnique({
      where: { id },
      include: { actions: { orderBy: { order: "asc" } } },
    });

    if (!scene) {
      return NextResponse.json({ error: "场景不存在" }, { status: 404 });
    }

    // Group actions by gateway for correct routing
    const actionsByGateway = new Map<string, typeof scene.actions>();

    // Batch query all device gatewayIds in one call
    const deviceIds = scene.actions.map((a) => a.deviceId);
    const devices = await prisma.device.findMany({
      where: { id: { in: deviceIds } },
      select: { id: true, gatewayId: true },
    });
    const deviceGatewayMap = new Map(devices.map((d) => [d.id, d.gatewayId]));

    for (const action of scene.actions) {
      const gwKey = deviceGatewayMap.get(action.deviceId) || "__fallback__";
      if (!actionsByGateway.has(gwKey)) actionsByGateway.set(gwKey, []);
      actionsByGateway.get(gwKey)!.push(action);
    }

    logger.info("Scene", `开始执行场景「${scene.name}」，包含 ${scene.actions.length} 个动作`);

    // 检查已连接的网关，连接状态由 GatewayService / instrumentation.ts / SettingsPage 统一管理
    const connectedGateways = multiGatewayService.getConnectedGateways();
    if (connectedGateways.length === 0) {
      return NextResponse.json({ error: "No gateway connected" }, { status: 503 });
    }

    // Flatten all actions with their gateway, then fire with 100ms interval
    const queuedActions: Array<{
      gw: NonNullable<ReturnType<typeof multiGatewayService.getGateway>>
      did: string
      action: string
      parsedValue: number[]
      meshId: string
      deviceId: string
    }> = []

    for (const [gwKey, gwActions] of actionsByGateway) {
      let gw = gwKey === "__fallback__"
        ? multiGatewayService.getConnectedGateways()[0]
        : multiGatewayService.getGateway(gwKey)

      if (!gw || !gw.isConnected) {
        // 不主动重连，跳过该网关上的动作
        logger.warn("Scene", `网关 ${gwKey} 未连接，跳过 ${gwActions.length} 条动作`)
        continue
      }

      for (const sa of gwActions) {
        const strValue = typeof sa.value === "string" ? sa.value.replace(/[\[\]"]/g, "") : String(sa.value)
        const parsedValue: number[] = strValue.split(",").map(Number)
        const ctrlAction = sa.action === "cct" ? "ctl" : sa.action
        const { did } = parseStoredDeviceId(sa.deviceId)

        queuedActions.push({ gw, did, action: ctrlAction, parsedValue, meshId: sa.meshId, deviceId: sa.deviceId })
      }
    }

    logger.info("Scene", `共 ${queuedActions.length} 条指令待发送，间隔 100ms`);

    // Fire all commands with 100ms interval, no waiting for response
    for (let i = 0; i < queuedActions.length; i++) {
      const { gw, did, action, parsedValue, meshId, deviceId } = queuedActions[i];
      try {
        gw.fireControl(did, action, parsedValue, meshId, 0);
      } catch (err) {
        logger.error("Scene", `指令发送失败 [${i + 1}/${queuedActions.length}]`, err);
      }
      // 100ms interval between each command (skip delay after the last one)
      if (i < queuedActions.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    logger.info("Scene", `场景「${scene.name}」执行完成，共发送 ${queuedActions.length} 条指令`);

    return Response.json({ success: true, executed: queuedActions.length });
  } catch (err) {
    logger.error("Scene", "场景执行失败", err);
    return NextResponse.json({ error: "执行场景失败" }, { status: 500 });
  }
}
