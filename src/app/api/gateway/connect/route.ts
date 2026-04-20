import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// IPv4 validation helper
function isValidIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const n = Number(part);
    return Number.isInteger(n) && n >= 0 && n <= 255 && part === String(n);
  });
}

export async function POST(request: Request) {
  try {
    const { ip, port, gatewayId } = await request.json();

    if (!ip) {
      return NextResponse.json({ error: "IP address is required" }, { status: 400 });
    }

    // IP validation
    if (!isValidIPv4(ip)) {
      return NextResponse.json({ error: "Invalid IP address format" }, { status: 400 });
    }

    const portNum = port ?? 8091;

    if (gatewayId) {
      // Connect specific gateway
      const gw = await prisma.gateway.findUnique({ where: { id: gatewayId } });
      if (!gw) {
        return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
      }
      await prisma.gateway.update({
        where: { id: gatewayId },
        data: { ip, port: portNum },
      });
      await multiGatewayService.connectGateway(gatewayId, ip, portNum);
      return NextResponse.json({ status: "connected", id: gatewayId, ip, port: portNum });
    } else {
      // Backward compat: if only one gateway exists, update and connect it
      const existing = await prisma.gateway.findFirst();
      if (existing) {
        await prisma.gateway.update({
          where: { id: existing.id },
          data: { ip, port: portNum },
        });
        await multiGatewayService.connectGateway(existing.id, ip, portNum);
        return NextResponse.json({ status: "connected", id: existing.id, ip, port: portNum });
      } else {
        return NextResponse.json({ error: "No gateway configured, use /api/gateway/add first" }, { status: 400 });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
