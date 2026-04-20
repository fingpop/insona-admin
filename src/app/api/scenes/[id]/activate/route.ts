import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";

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
    for (const action of scene.actions) {
      // Try to find device's gatewayId
      const device = await prisma.device.findUnique({ where: { id: action.deviceId } });
      const gwKey = device?.gatewayId || "__fallback__";
      if (!actionsByGateway.has(gwKey)) actionsByGateway.set(gwKey, []);
      actionsByGateway.get(gwKey)!.push(action);
    }

    console.log(`[Scene Activate] 场景 "${scene.name}" 包含 ${scene.actions.length} 个动作`);

    const results = [];
    const errors = [];

    for (const [gwKey, actions] of actionsByGateway) {
      const gw = gwKey === "__fallback__"
        ? multiGatewayService.getConnectedGateways()[0]
        : multiGatewayService.getGateway(gwKey);

      if (!gw?.isConnected) {
        errors.push({ error: `Gateway ${gwKey} not connected` });
        continue;
      }

      // Group by mesh within this gateway
      const byMesh = new Map<string, typeof actions>();
      for (const a of actions) {
        if (!byMesh.has(a.meshId)) byMesh.set(a.meshId, []);
        byMesh.get(a.meshId)!.push(a);
      }

      for (const [meshId, meshActions] of byMesh) {
        for (const sa of meshActions) {
          try {
            const strValue = typeof sa.value === "string" ? sa.value.replace(/[\[\]"]/g, "") : String(sa.value);
            const parsedValue: number[] = strValue.split(",").map(Number);

            const action = sa.action === "cct" ? "ctl" : sa.action;

            await gw.controlDevice(sa.deviceId, action, parsedValue, meshId, 0, 2000);
            results.push({ deviceId: sa.deviceId, action, meshId, success: true });
          } catch (err) {
            console.error(`[Scene Activate] 错误:`, err);
            errors.push({ deviceId: sa.deviceId, error: String(err) });
          }
        }
      }
    }

    console.log(`[Scene Activate] 执行完成，成功 ${results.length} 条，失败 ${errors.length} 条`);

    return Response.json({ success: errors.length === 0, executed: results, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    console.error("Failed to activate scene:", err);
    return NextResponse.json({ error: "执行场景失败" }, { status: 500 });
  }
}
