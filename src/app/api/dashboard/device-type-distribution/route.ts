import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEVICE_TYPE_LABELS } from "@/lib/types";

export const runtime = "nodejs";

// 获取设备类型分布数据
export async function GET() {
  try {
    // 获取所有设备
    const devices = await prisma.device.findMany({
      select: { type: true, alive: true },
    });

    // 按类型分组统计
    const distribution = devices.reduce<Record<number, { count: number; online: number; label: string }>>(
      (acc, d) => {
        const label = DEVICE_TYPE_LABELS[d.type] ?? `类型${d.type}`;
        if (!acc[d.type]) acc[d.type] = { count: 0, online: 0, label };
        acc[d.type].count++;
        if (d.alive === 1) acc[d.type].online++;
        return acc;
      },
      {}
    );

    // 转换为数组格式
    const result = Object.entries(distribution).map(([type, info]) => ({
      type: parseInt(type),
      label: info.label,
      count: info.count,
      online: info.online,
      percentage: devices.length > 0 ? info.count / devices.length : 0,
    }));

    // 按数量排序
    result.sort((a, b) => b.count - a.count);

    return Response.json({
      distribution: result,
      total: devices.length,
    });
  } catch (error) {
    console.error("Device type distribution error:", error);
    return NextResponse.json({ error: "获取设备类型分布失败" }, { status: 500 });
  }
}