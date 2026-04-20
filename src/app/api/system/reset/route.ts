import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  try {
    // Disconnect all gateways
    const gateways = multiGatewayService.getConnectedGateways();
    await Promise.all(gateways.map((gw) => gw.disconnect()));

    // Clear all database tables
    await prisma.sceneAction.deleteMany();
    await prisma.scheduledTask.deleteMany();
    await prisma.scene.deleteMany();
    await prisma.dashboardEvent.deleteMany();
    await prisma.energyData.deleteMany();
    await prisma.energyHourly.deleteMany();
    await prisma.energySnapshot.deleteMany();
    await prisma.energyRecord.deleteMany();
    await prisma.device.deleteMany();
    await prisma.room.deleteMany();
    await prisma.gateway.deleteMany();

    return NextResponse.json({ status: "ok", message: "系统已重置" });
  } catch (err) {
    console.error("[SystemReset]", err);
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "重置失败" },
      { status: 500 }
    );
  }
}
