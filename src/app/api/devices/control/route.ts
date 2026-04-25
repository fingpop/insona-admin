import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";
import { isGroupDevice } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { did, action, value, transition, meshid } = await request.json();

    if (!did || !action || !meshid) {
      return NextResponse.json(
        { error: "Missing required fields: did, action, meshid" },
        { status: 400 }
      );
    }

    // Route to the correct gateway via gatewayId
    // Group devices: id in DB is the raw DID (e.g. "C1"), not "meshId:did"
    let device;
    let controlDid = did;

    if (isGroupDevice(did)) {
      // For group devices, look up by raw DID + meshId
      device = await prisma.device.findUnique({
        where: { id_meshId: { id: did, meshId: meshid } },
      });
      if (device) {
        controlDid = device.originalDid || did;
      }
    } else {
      device = await prisma.device.findUnique({ where: { id: did } });
    }

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    let connectedGateways = multiGatewayService.getConnectedGateways();

    if (connectedGateways.length === 0) {
      await multiGatewayService.loadAndConnectAll();
      connectedGateways = multiGatewayService.getConnectedGateways();
    }

    let gw = device.gatewayId ? multiGatewayService.getGateway(device.gatewayId) : undefined;
    if (gw && !gw.isConnected) {
      gw = undefined;
    }

    if (!gw && device.meshId) {
      const peers = await prisma.device.findMany({
        where: {
          meshId: device.meshId,
          gatewayId: { not: null },
        },
        select: { gatewayId: true },
        distinct: ["gatewayId"],
      });

      for (const peer of peers) {
        if (!peer.gatewayId) continue;
        const candidate = multiGatewayService.getGateway(peer.gatewayId);
        if (candidate?.isConnected) {
          gw = candidate;
          break;
        }
      }
    }

    if (!gw && connectedGateways.length === 1) {
      gw = connectedGateways[0];
    }

    if (!gw || !gw.isConnected) {
      return NextResponse.json({ error: "Gateway not connected" }, { status: 503 });
    }

    await gw.controlDevice(controlDid, action, value ?? [], meshid, transition ?? 0);

    if (isGroupDevice(did)) {
      await prisma.device.update({
        where: { id_meshId: { id: did, meshId: meshid } },
        data: { value: JSON.stringify(value ?? []) },
      });
    } else {
      await prisma.device.update({
        where: { id: did },
        data: { value: JSON.stringify(value ?? []) },
      });
    }

    return NextResponse.json({ result: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Control failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
