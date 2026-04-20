import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

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
    const { name, ip, port, autoConnect } = await request.json();

    if (!ip) {
      return NextResponse.json({ error: "IP address is required" }, { status: 400 });
    }

    if (!isValidIPv4(ip)) {
      return NextResponse.json({ error: "Invalid IP address format" }, { status: 400 });
    }

    const portNum = port ?? 8091;
    const displayName = name || `${ip}:${portNum}`;

    const gw = await prisma.gateway.create({
      data: { name: displayName, ip, port: portNum },
    });

    if (autoConnect !== false) {
      await multiGatewayService.connectGateway(gw.id, gw.ip, gw.port);
    }

    return NextResponse.json({ id: gw.id, name: gw.name, ip: gw.ip, port: gw.port, status: "connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add gateway";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
