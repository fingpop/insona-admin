import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";
import { getLocalDate } from "@/lib/utils";

export const runtime = "nodejs";

function parseJsonArray(value: string | null): number[] {
  try { return JSON.parse(value ?? "[]") as number[]; } catch { return []; }
}

function enrichDevices(devices: { id: string; funcs: string | null; groups: string | null; lastPower: number; lastPercent: number }[], includeEnergy = false) {
  if (!includeEnergy) {
    return devices.map((d) => ({
      ...d,
      funcs: parseJsonArray(d.funcs),
      groups: parseJsonArray(d.groups),
      power: null,
      todayKwh: null,
    }));
  }

  const today = getLocalDate();
  const energyRecords = prisma.energyRecord.findMany({
    where: { date: today, deviceId: { in: devices.map((d) => d.id) } },
  });

  return energyRecords.then((records) => {
    const energyMap = new Map<string, number>();
    for (const record of records) {
      energyMap.set(record.deviceId, record.kwh);
    }
    return devices.map((d) => {
      // lastPower 已经是实际功率（GatewayService 中 = 额定功率 × 百分比），直接使用
      const realTimePower = d.lastPower > 0
        ? Math.round(d.lastPower * 10) / 10
        : null;
      return {
        ...d,
        funcs: parseJsonArray(d.funcs),
        groups: parseJsonArray(d.groups),
        power: realTimePower,
        todayKwh: energyMap.get(d.id) ?? null,
      };
    });
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");
  const type = searchParams.get("type");
  const alive = searchParams.get("alive");
  const noEnergy = searchParams.get("noEnergy") === "true";

  const where: Record<string, unknown> = {};
  if (roomId) where.roomId = roomId;
  if (type) where.type = parseInt(type);
  if (alive !== null) where.alive = alive === "1" ? 1 : 0;

  const devices = await prisma.device.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      pid: true,
      ver: true,
      type: true,
      alive: true,
      name: true,
      gatewayName: true,
      func: true,
      funcs: true,
      value: true,
      groups: true,
      meshId: true,
      originalDid: true,
      ratedPower: true,
      lastPower: true,
      lastPercent: true,
      roomId: true,
      gatewayId: true,
      createdAt: true,
      updatedAt: true,
      room: { select: { id: true, name: true, type: true, parentId: true } },
    },
  });

  // 空间管理/场景/自动化等 Tab 不需要能耗数据，跳过 2 次额外查询
  if (noEnergy) {
    const devicesParsed = devices.map((d) => ({
      ...d,
      funcs: parseJsonArray(d.funcs),
      groups: parseJsonArray(d.groups),
      power: null,
      todayKwh: null,
    }));
    return Response.json({ devices: devicesParsed });
  }

  const enriched = await enrichDevices(devices, true);
  return Response.json({ devices: enriched });
}

// POST /api/devices — trigger full sync from ALL connected gateways
export async function POST() {
  try {
    const gateways = multiGatewayService.getConnectedGateways();

    if (gateways.length === 0) {
      return Response.json({ error: "No gateway connected" }, { status: 503 });
    }

    // Sync from all connected gateways
    for (const gw of gateways) {
      await gw.syncDevices();
    }

    const devices = await prisma.device.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        pid: true,
        ver: true,
        type: true,
        alive: true,
        name: true,
        gatewayName: true,
        func: true,
        funcs: true,
        value: true,
        groups: true,
        meshId: true,
        originalDid: true,
        ratedPower: true,
        lastPower: true,
        lastPercent: true,
        roomId: true,
        gatewayId: true,
        createdAt: true,
        updatedAt: true,
        room: { select: { id: true, name: true, type: true, parentId: true } },
      },
    });

    const enriched = await enrichDevices(devices, true);
    return Response.json({ result: "ok", count: enriched.length, devices: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
