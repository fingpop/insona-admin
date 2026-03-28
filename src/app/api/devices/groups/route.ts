import { prisma } from "@/lib/prisma";
import { isGroupDevice, parseStoredDeviceId } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/devices/groups — 获取组设备列表
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const meshId = searchParams.get("meshId");
  const alive = searchParams.get("alive");

  // 获取所有设备，过滤出组设备（存储 ID 中包含组设备 DID）
  const allDevices = await prisma.device.findMany({
    include: { room: true },
    orderBy: { id: "asc" },
  });

  // 应用筛选
  let groupDevices = allDevices.filter((d) => isGroupDevice(d.id) || isGroupDevice(d.originalDid || ""));

  if (meshId) {
    groupDevices = groupDevices.filter((d) => d.meshId === meshId);
  }

  if (alive !== null) {
    const aliveValue = alive === "1" ? 1 : 0;
    groupDevices = groupDevices.filter((d) => d.alive === aliveValue);
  }

  // 解析存储 ID，返回原始 DID 用于显示
  const devicesWithOriginalDid = groupDevices.map((d) => {
    const { did } = parseStoredDeviceId(d.id);
    return {
      ...d,
      displayId: did,  // 用于显示的原始 DID
    };
  });

  return Response.json({ devices: devicesWithOriginalDid });
}
