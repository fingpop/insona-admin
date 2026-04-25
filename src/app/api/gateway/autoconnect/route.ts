import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";

export const runtime = "nodejs";

export async function POST() {
  await multiGatewayService.loadAndConnectAll();
  const connected = multiGatewayService.getConnectedGateways();
  return NextResponse.json({
    status: connected.length > 0 ? "connected" : "disconnected",
    connected: connected.length,
  });
}
