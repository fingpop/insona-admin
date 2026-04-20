import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const gateways = await prisma.gateway.findMany({ orderBy: { createdAt: "asc" } });
  const connectedIds = new Set(
    multiGatewayService.getConnectedGateways().map((gw) => gw.id)
  );

  return NextResponse.json({
    gateways: gateways.map((gw) => ({
      ...gw,
      liveStatus: connectedIds.has(gw.id) ? "connected" : gw.status,
    })),
  });
}
