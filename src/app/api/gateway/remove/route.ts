import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { gatewayId } = await request.json();

    if (!gatewayId) {
      return NextResponse.json({ error: "gatewayId is required" }, { status: 400 });
    }

    const gw = await prisma.gateway.findUnique({ where: { id: gatewayId } });
    if (!gw) {
      return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
    }

    // Disconnect and remove from MultiGatewayService
    await multiGatewayService.removeGateway(gatewayId);

    // Unlink devices (don't delete them)
    await prisma.device.updateMany({
      where: { gatewayId },
      data: { gatewayId: null },
    });

    // Delete gateway record
    await prisma.gateway.delete({ where: { id: gatewayId } });

    return NextResponse.json({ status: "ok", id: gatewayId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove gateway";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
