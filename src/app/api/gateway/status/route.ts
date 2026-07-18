import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const gateways = await prisma.gateway.findMany({ orderBy: { createdAt: "asc" } });
  const connectedIds = new Set(
    multiGatewayService.getConnectedGateways().map((gw) => gw.id)
  );

  // Build a map of actual gateway status from MultiGatewayService (in-memory)
  const memStatus = new Map<string, string>();
  for (const gw of gateways) {
    const svc = multiGatewayService.getGateway(gw.id);
    if (svc) {
      // Use the real in-memory status (connected / reconnecting / disconnected)
      memStatus.set(gw.id, svc.status);
    }
  }

  return NextResponse.json({
    gateways: gateways.map((gw) => ({
      ...gw,
      status: connectedIds.has(gw.id) ? "connected"
        : memStatus.has(gw.id) ? memStatus.get(gw.id)
        : "disconnected",
    })),
  });
}
