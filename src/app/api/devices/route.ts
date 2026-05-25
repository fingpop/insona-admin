import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";
import { getLocalDate } from "@/lib/utils";

export const runtime = "nodejs";

function parseJsonArray(value: string | null): number[] {
  try { return JSON.parse(value ?? "[]") as number[]; } catch { return []; }
}

function enrichDevices(devices: { id: string; funcs: string | null; groups: string | null }[], includeEnergy = false) {
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

  const recentEnergyData = prisma.energyData.findMany({
    where: {
      timestamp: { gte: new Date(Date.now() - 3600000) },
      deviceId: { in: devices.map((d) => d.id) }
    },
    orderBy: { sequence: "desc" },
  });

  return Promise.all([energyRecords, recentEnergyData]).then(([records, data]) => {
    const energyMap = new Map<string, { totalKwh: number; latestPower: number }>();
    for (const record of records) {
      energyMap.set(record.deviceId, { totalKwh: record.kwh, latestPower: record.peakWatts });
    }
    for (const d of data) {
      const existing = energyMap.get(d.deviceId);
      if (existing) {
        existing.latestPower = d.power;
      } else {
        energyMap.set(d.deviceId, { totalKwh: 0, latestPower: d.power });
      }
    }
    return devices.map((d) => ({
      ...d,
      funcs: parseJsonArray(d.funcs),
      groups: parseJsonArray(d.groups),
      power: energyMap.get(d.id)?.latestPower ?? null,
      todayKwh: energyMap.get(d.id)?.totalKwh ?? null,
    }));
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
    include: { room: true },
    orderBy: { name: "asc" },
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
    let gateways = multiGatewayService.getConnectedGateways();

    // If no gateways connected, attempt auto-reconnect
    if (gateways.length === 0) {
      await multiGatewayService.loadAndConnectAll();
      gateways = multiGatewayService.getConnectedGateways();
      if (gateways.length === 0) {
        return Response.json({ error: "No gateway connected" }, { status: 503 });
      }
    }

    // Sync from all connected gateways
    for (const gw of gateways) {
      await gw.syncDevices();
    }

    const devices = await prisma.device.findMany({
      include: { room: true },
      orderBy: { name: "asc" },
    });

    const enriched = await enrichDevices(devices, true);
    return Response.json({ result: "ok", count: enriched.length, devices: enriched });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
