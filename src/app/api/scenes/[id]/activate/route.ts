import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { gatewayService } from "@/lib/gateway/GatewayService";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

// 激活场景
export async function POST(request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    if (!gatewayService.isConnected) {
      return NextResponse.json({ error: "网关未连接" }, { status: 503 });
    }

    // 获取场景及其动作
    const scene = await prisma.scene.findUnique({
      where: { id },
      include: { actions: { orderBy: { order: "asc" } } },
    });

    if (!scene) {
      return NextResponse.json({ error: "场景不存在" }, { status: 404 });
    }

    // 按 mesh 分组执行动作
    const actionsByMesh = new Map<string, typeof scene.actions>();
    for (const action of scene.actions) {
      if (!actionsByMesh.has(action.meshId)) {
        actionsByMesh.set(action.meshId, []);
      }
      actionsByMesh.get(action.meshId)!.push(action);
    }

    // 执行每个 mesh 的动作
    console.log(`[Scene Activate] 场景 "${scene.name}" 包含 ${scene.actions.length} 个动作`);

    const results = [];
    const errors = [];
    for (const [meshId, actions] of actionsByMesh) {
      for (const sa of actions) {
        try {
          // 解析 value：数据库存储为 JSON 字符串 "[0,50]"
          // 使用简单解析确保得到数字数组
          const strValue = typeof sa.value === "string" ? sa.value.replace(/[\[\]"]/g, "") : String(sa.value);
          const parsedValue: number[] = strValue.split(",").map(Number);

          console.log(`[Scene Activate] device=${sa.deviceId}, action=${sa.action}, parsedValue=${JSON.stringify(parsedValue)}, isArray=${Array.isArray(parsedValue)}`);

          // 修正旧的 action 值
          const action = sa.action === "cct" ? "ctl" : sa.action;

          await gatewayService.controlDevice(sa.deviceId, action, parsedValue, meshId, 0, 2000);
          results.push({ deviceId: sa.deviceId, action, meshId, success: true });
        } catch (err) {
          console.error(`[Scene Activate] 错误:`, err);
          errors.push({ deviceId: sa.deviceId, error: String(err) });
        }
      }
    }

    console.log(`[Scene Activate] 执行完成，成功 ${results.length} 条，失败 ${errors.length} 条`);

    return Response.json({ success: errors.length === 0, executed: results, errors: errors.length > 0 ? errors : undefined });
  } catch (err) {
    console.error("Failed to activate scene:", err);
    return NextResponse.json({ error: "执行场景失败" }, { status: 500 });
  }
}
