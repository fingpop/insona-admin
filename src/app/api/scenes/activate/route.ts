import { NextResponse } from "next/server";
import { gatewayService } from "@/lib/gateway/GatewayService";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { sceneId, meshid } = await request.json();

    if (!sceneId || !meshid) {
      return NextResponse.json({ error: "sceneId and meshid are required" }, { status: 400 });
    }

    if (!gatewayService.isConnected) {
      return NextResponse.json({ error: "Gateway not connected" }, { status: 503 });
    }

    await gatewayService.activateScene(sceneId, meshid);

    return Response.json({ result: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to activate scene";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
