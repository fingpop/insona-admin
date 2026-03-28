import { NextResponse } from "next/server";
import { gatewayService } from "@/lib/gateway/GatewayService";
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

    // 根据是否是组设备，使用不同的查询方式
    let device;
    let storedId: string;
    let controlDid = did;

    if (isGroupDevice(did)) {
      // 组设备：使用 meshId:did 组合键查询
      storedId = `${meshid}:${did}`;
      device = await prisma.device.findUnique({
        where: { id_meshId: { id: storedId, meshId: meshid } },
      });
      if (device) {
        // 使用存储的 originalDid 作为控制 DID
        controlDid = device.originalDid || did;
      }
    } else {
      // 普通设备：直接用 did 查询
      storedId = did;
      device = await prisma.device.findUnique({ where: { id: did } });
    }

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    if (!gatewayService.isConnected) {
      return NextResponse.json({ error: "Gateway not connected" }, { status: 503 });
    }

    // 使用原始 DID 发送到网关
    await gatewayService.controlDevice(controlDid, action, value ?? [], meshid, transition ?? 0);

    // 更新本地状态
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
