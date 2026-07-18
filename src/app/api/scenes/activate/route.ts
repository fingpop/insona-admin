import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { sceneId, meshid } = await request.json();

    if (!sceneId || !meshid) {
      return NextResponse.json({ error: "sceneId and meshid are required" }, { status: 400 });
    }

    // 检查已连接的网关，连接状态由 GatewayService / instrumentation.ts / SettingsPage 统一管理
    const gateways = multiGatewayService.getConnectedGateways();
    if (gateways.length === 0) {
      return NextResponse.json({ error: "No gateway connected" }, { status: 503 });
    }
    const gw = gateways[0];

    await gw.activateScene(sceneId, meshid);

    return Response.json({ result: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to activate scene";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
