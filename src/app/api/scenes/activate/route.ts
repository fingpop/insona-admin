import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { sceneId, meshid } = await request.json();

    if (!sceneId || !meshid) {
      return NextResponse.json({ error: "sceneId and meshid are required" }, { status: 400 });
    }

    // Find a connected gateway that has this mesh
    const gateways = multiGatewayService.getConnectedGateways();
    const gw = gateways[0];
    if (!gw) {
      return NextResponse.json({ error: "No gateway connected" }, { status: 503 });
    }

    await gw.activateScene(sceneId, meshid);

    return Response.json({ result: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to activate scene";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
