import { NextResponse } from "next/server";
import { gatewayService } from "@/lib/gateway/GatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST() {
  try {
    // 1. Disconnect gateway
    gatewayService.disconnect();

    // 2. Clear all database tables (in reverse dependency order)
    await prisma.sceneAction.deleteMany();
    await prisma.scene.deleteMany();
    await prisma.energySnapshot.deleteMany();
    await prisma.energyRecord.deleteMany();
    await prisma.scheduledTask.deleteMany();
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
