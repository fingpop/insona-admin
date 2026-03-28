import { NextResponse } from "next/server";
import { gatewayService } from "@/lib/gateway/GatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const gateway = await prisma.gateway.findUnique({ where: { id: "default" } });
  const status = gatewayService.status;

  return NextResponse.json({
    ip: gateway?.ip ?? null,
    port: gateway?.port ?? 8091,
    status,
    lastSeen: gateway?.lastSeen ?? null,
  });
}
