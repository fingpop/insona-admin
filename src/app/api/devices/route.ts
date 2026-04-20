import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";
import { prisma } from "@/lib/prisma";
import { DEFAULT_RATED_POWER, isGroupDevice } from "@/lib/types";
import { InSonaDevice } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Derive the best device func from the funcs array.
 * Priority: HSL(5) > dual-temp(4) > dimming(3) > onoff(2)
 * Falls back to the raw func value if funcs is empty.
 */
function deriveFunc(rawFunc: number, funcs: number[]): number {
  if (!funcs || funcs.length === 0) return rawFunc;
  if (rawFunc > 0 && funcs.length > 0) {
    if (!funcs.includes(rawFunc)) return funcs[0];
    return rawFunc;
  }
  if (funcs.includes(5)) return 5;
  if (funcs.includes(4)) return 4;
  if (funcs.includes(3)) return 3;
  if (funcs.includes(2)) return 2;
  return funcs[0];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");
  const type = searchParams.get("type");
  const alive = searchParams.get("alive");

  const where: Record<string, unknown> = {};
  if (roomId) where.roomId = roomId;
  if (type) where.type = parseInt(type);
  if (alive !== null) where.alive = alive === "1" ? 1 : 0;

  const devices = await prisma.device.findMany({
    where,
    include: { room: true },
    orderBy: { name: "asc" },
  });

  const today = new Date().toISOString().split("T")[0];
  const energyRecords = await prisma.energyRecord.findMany({
    where: { date: today, deviceId: { in: devices.map((d) => d.id) } },
  });

  const recentEnergyData = await prisma.energyData.findMany({
    where: {
      timestamp: { gte: new Date(Date.now() - 3600000) },
      deviceId: { in: devices.map((d) => d.id) }
    },
    orderBy: { sequence: "desc" },
  });

  const energyMap = new Map<string, { totalKwh: number; latestPower: number }>();
  for (const record of energyRecords) {
    energyMap.set(record.deviceId, { totalKwh: record.kwh, latestPower: record.peakWatts });
  }

  for (const data of recentEnergyData) {
    const existing = energyMap.get(data.deviceId);
    if (existing) {
      existing.latestPower = data.power;
    } else {
      energyMap.set(data.deviceId, { totalKwh: 0, latestPower: data.power });
    }
  }

  const devicesWithEnergy = devices.map((d) => {
    const energy = energyMap.get(d.id);
    return {
      ...d,
      funcs: (() => { try { return JSON.parse(d.funcs) as number[]; } catch { return []; } })(),
      groups: (() => { try { return JSON.parse(d.groups) as number[]; } catch { return []; } })(),
      power: energy?.latestPower ?? null,
      todayKwh: energy?.totalKwh ?? null,
    };
  });

  return Response.json({ devices: devicesWithEnergy });
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
      include: { room: true },
      orderBy: { name: "asc" },
    });

    const today = new Date().toISOString().split("T")[0];
    const energyRecords = await prisma.energyRecord.findMany({
      where: { date: today, deviceId: { in: devices.map((d) => d.id) } },
    });

    const recentEnergyData = await prisma.energyData.findMany({
      where: {
        timestamp: { gte: new Date(Date.now() - 3600000) },
        deviceId: { in: devices.map((d) => d.id) }
      },
      orderBy: { sequence: "desc" },
    });

    const energyMap = new Map<string, { totalKwh: number; latestPower: number }>();
    for (const record of energyRecords) {
      energyMap.set(record.deviceId, { totalKwh: record.kwh, latestPower: record.peakWatts });
    }
    for (const data of recentEnergyData) {
      const existing = energyMap.get(data.deviceId);
      if (existing) {
        existing.latestPower = data.power;
      } else {
        energyMap.set(data.deviceId, { totalKwh: 0, latestPower: data.power });
      }
    }

    const devicesWithEnergy = devices.map((d) => {
      const energy = energyMap.get(d.id);
      return {
        ...d,
        funcs: (() => { try { return JSON.parse(d.funcs) as number[]; } catch { return []; } })(),
        power: energy?.latestPower ?? null,
        todayKwh: energy?.totalKwh ?? null,
      };
    });

    return Response.json({ result: "ok", count: devicesWithEnergy.length, devices: devicesWithEnergy });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
