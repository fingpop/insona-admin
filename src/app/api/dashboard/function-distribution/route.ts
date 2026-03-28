import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FUNC_LABELS } from "@/lib/types";

export const runtime = "nodejs";

// 获取功能类型分布数据（雷达图）
export async function GET() {
  try {
    // 获取所有设备的功能类型
    const devices = await prisma.device.findMany({
      select: { func: true, funcs: true },
    });

    // 统计各功能类型数量
    const functionCount: Record<number, number> = {};

    devices.forEach((device) => {
      // 统计主功能
      if (!functionCount[device.func]) functionCount[device.func] = 0;
      functionCount[device.func]++;

      // 统计所有支持的功能（funcs 数组）
      try {
        const funcsArray = JSON.parse(device.funcs);
        funcsArray.forEach((f: number) => {
          if (!functionCount[f]) functionCount[f] = 0;
          functionCount[f]++;
        });
      } catch {
        // 如果 JSON 解析失败，忽略
      }
    });

    // 转换为数组格式，只包含有数据的功能类型
    const distribution = Object.entries(functionCount)
      .filter(([func]) => FUNC_LABELS[parseInt(func)]) // 只包含有标签的功能
      .map(([func, count]) => ({
        func: parseInt(func),
        label: FUNC_LABELS[parseInt(func)] || `功能${func}`,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // 为雷达图补充全维度数据（即使数量为0）
    const radarDimensions = [2, 3, 4, 5, 9, 10, 14, 21, 24];
    const radarData = radarDimensions.map((func) => ({
      func,
      label: FUNC_LABELS[func] || `功能${func}`,
      count: functionCount[func] || 0,
    }));

    return Response.json({
      distribution,
      radarData,
      total: devices.length,
    });
  } catch (error) {
    console.error("Function distribution error:", error);
    return NextResponse.json({ error: "获取功能分布失败" }, { status: 500 });
  }
}