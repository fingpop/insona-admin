import { NextResponse } from "next/server";
import { gatewayService } from "@/lib/gateway/GatewayService";
import { prisma } from "@/lib/prisma";
import { InSonaDevice } from "@/lib/types";

export const runtime = "nodejs";

// 服务启动时自动连接已保存的网关
export async function POST() {
  try {
    // 如果已经连接，直接返回
    if (gatewayService.isConnected) {
      return NextResponse.json({ status: "already_connected", ip: gatewayService["ip"] });
    }

    // 从数据库获取已保存的网关配置
    const gateway = await prisma.gateway.findUnique({ where: { id: "default" } });

    if (!gateway || !gateway.ip) {
      return NextResponse.json({ status: "no_gateway_config" });
    }

    // 尝试连接网关
    await gatewayService.connect(gateway.ip, gateway.port ?? 8091);

    // 连接成功后，查询设备列表并更新数据库
    const result = await gatewayService.queryDevices();

    // 更新网关状态
    await prisma.gateway.update({
      where: { id: "default" },
      data: { status: "connected", lastSeen: new Date() },
    });

    // 解析设备数据并保存到数据库
    if (result && typeof result === "object" && "devices" in result) {
      const gatewayDevices = (result as unknown as { devices: InSonaDevice[] }).devices;

      for (const dev of gatewayDevices) {
        const did = String(dev.did);
        const pid = Number(dev.pid ?? 0);
        const ver = String(dev.ver ?? "");
        const type = Number(dev.type);
        const name = String(dev.name || `设备${did.slice(-6)}`);
        const meshId = dev.meshid ? String(dev.meshid) : undefined;
        const func = Number(dev.func || 0);
        const alive = Number(dev.alive ?? 1);
        const value = dev.value !== undefined ? JSON.stringify(dev.value) : "[]";

        // 查找是否已存在
        const existing = await prisma.device.findUnique({ where: { id: did } });

        if (existing) {
          await prisma.device.update({
            where: { id: did },
            data: {
              pid,
              ver,
              type,
              name,
              meshId,
              func,
              alive,
              value,
            },
          });
        } else {
          await prisma.device.create({
            data: {
              id: did,
              pid,
              ver,
              type,
              name,
              meshId,
              func,
              alive,
              value,
            },
          });
        }
      }
    }

    return NextResponse.json({
      status: "connected",
      ip: gateway.ip,
      port: gateway.port,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Auto-connect failed";
    console.error("[AutoConnect]", message);
    return NextResponse.json({ status: "failed", error: message });
  }
}
