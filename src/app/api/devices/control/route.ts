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

    let device;
    let storedId: string;
    let controlDid = did;

    if (isGroupDevice(did)) {
      storedId = `${meshid}:${did}`;
      device = await prisma.device.findUnique({
        where: { id_meshId: { id: storedId, meshId: meshid } },
      });
      if (device) {
        controlDid = device.originalDid || did;
      }
    } else {
      storedId = did;
      device = await prisma.device.findUnique({ where: { id: did } });
    }

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    // Route to the correct gateway via gatewayId
    const gw = device.gatewayId ? multiGatewayService.getGateway(device.gatewayId) : undefined;
    if (!gw || !gw.isConnected) {
      return NextResponse.json({ error: "Gateway not connected" }, { status: 503 });
    }

    await gw.controlDevice(controlDid, action, value ?? [], meshid, transition ?? 0);

    if (isGroupDevice(did)) {
      await prisma.device.update({
        where: { id_meshId: { id: storedId, meshId: meshid } },
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
