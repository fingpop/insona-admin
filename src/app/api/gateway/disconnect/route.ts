import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { gatewayId } = await request.json();

  if (gatewayId) {
    await multiGatewayService.disconnectGateway(gatewayId);
    return NextResponse.json({ status: "disconnected", id: gatewayId });
  }

  // Backward compat: disconnect all connected gateways
  const gateways = multiGatewayService.getConnectedGateways();
  await Promise.all(gateways.map((gw) => gw.disconnect()));
  return NextResponse.json({ status: "disconnected", count: gateways.length });
}
