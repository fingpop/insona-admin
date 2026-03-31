import { NextResponse } from "next/server";
import { gatewayService } from "@/lib/gateway/GatewayService";
import { prisma } from "@/lib/prisma";

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

    // 尝试连接网关（queryDevices() 会自动调用）
    await gatewayService.connect(gateway.ip, gateway.port ?? 8091);

    // GatewayService.connect() 内部已自动调用 queryDevices() 并广播 SSE 事件
    // 前端会通过 SSE 的 "connected" 和 "s.query" 事件自动刷新设备列表

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
