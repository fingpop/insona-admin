import { NextResponse } from "next/server";
import { gatewayService } from "@/lib/gateway/GatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { ip, port } = await request.json();

    if (!ip) {
      return NextResponse.json({ error: "IP address is required" }, { status: 400 });
    }

    // Save gateway config to DB
    await prisma.gateway.upsert({
      where: { id: "default" },
      update: { ip, port: port ?? 8091 },
      create: { id: "default", ip, port: port ?? 8091 },
    });

    // Attempt connection
    await gatewayService.connect(ip, port ?? 8091);

    // Update status in DB
    await prisma.gateway.update({
      where: { id: "default" },
      data: { status: "connected", lastSeen: new Date() },
    });

    return NextResponse.json({ status: "connected", ip, port: port ?? 8091 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
