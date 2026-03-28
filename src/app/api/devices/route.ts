import { gatewayService } from "@/lib/gateway/GatewayService";
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
  // If raw func is valid (>0) and funcs is empty, use raw func
  if (!funcs || funcs.length === 0) return rawFunc;
  if (rawFunc > 0 && funcs.length > 0) {
    // Prefer derived func from funcs if raw func is not in the funcs list
    if (!funcs.includes(rawFunc)) return funcs[0];
    return rawFunc;
  }
  // raw func is 0 or invalid — derive from funcs
  if (funcs.includes(5)) return 5; // HSL
  if (funcs.includes(4)) return 4; // dual color temp
  if (funcs.includes(3)) return 3; // dimming
  if (funcs.includes(2)) return 2; // on/off
  return funcs[0]; // fallback to first available
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

  // 获取今日能耗数据
  const today = new Date().toISOString().split("T")[0];
  const energyRecords = await prisma.energyRecord.findMany({
    where: { date: today, deviceId: { in: devices.map((d) => d.id) } },
  });

  // 转换为 map，方便关联
  const energyMap = new Map(energyRecords.map((r) => [r.deviceId, r]));

  // 合并设备数据和能耗数据
  const devicesWithEnergy = devices.map((d) => {
    const energy = energyMap.get(d.id);
    return {
      ...d,
      funcs: (() => { try { return JSON.parse(d.funcs) as number[]; } catch { return []; } })(),
      power: energy?.peakWatts ?? null,
      todayKwh: energy?.kwh ?? null,
    };
  });

  return Response.json({ devices: devicesWithEnergy });
}

// POST /api/devices — trigger full sync from gateway
export async function POST() {
  try {
    if (!gatewayService.isConnected) {
      return Response.json({ error: "Gateway not connected" }, { status: 503 });
    }

    const result = await gatewayService.queryDevices();

    if (!result.devices) {
      return Response.json({ error: "Invalid response from gateway" }, { status: 502 });
    }

    // Upsert rooms
    if (result.rooms) {
      for (const room of result.rooms) {
        await prisma.room.upsert({
          where: { id: String(room.roomId) },
          update: { name: room.name },
          create: { id: String(room.roomId), name: room.name },
        });
      }
    }

    // Upsert devices
    for (const d of result.devices as InSonaDevice[]) {
      const ratedPower = DEFAULT_RATED_POWER[d.type] ?? 10;
      const isGroup = isGroupDevice(d.did);
      const deviceFuncs = Array.isArray(d.funcs) ? d.funcs : [];
      const resolvedFunc = deriveFunc(d.func ?? 0, deviceFuncs);

      // meshid 为空时只能用简单唯一键，为空时用复合唯一键
      const hasMeshId = d.meshid && d.meshid.trim() !== "";
      const deviceId = (isGroup && hasMeshId)
        ? `${d.meshid}:${d.did}`
        : d.did;

      const whereClause = hasMeshId && isGroup
        ? { id_meshId: { id: deviceId, meshId: d.meshid } as { id: string; meshId: string } }
        : { id: deviceId };

      await prisma.device.upsert({
        where: whereClause,
        update: {
          pid: d.pid,
          ver: d.ver,
          type: d.type,
          alive: d.alive,
          gatewayName: d.name,
          func: resolvedFunc,
          value: JSON.stringify(d.value ?? []),
          meshId: d.meshid || null,
          originalDid: isGroup ? d.did : null,
        },
        create: {
          id: deviceId,
          pid: d.pid,
          ver: d.ver,
          type: d.type,
          alive: d.alive,
          name: d.name,
          gatewayName: d.name,
          func: resolvedFunc,
          funcs: JSON.stringify(deviceFuncs),
          value: JSON.stringify(d.value ?? []),
          meshId: d.meshid || null,
          originalDid: isGroup ? d.did : null,
          roomId: result.rooms?.find((r) => String(r.roomId) === String(d.roomId))
            ? String(d.roomId)
            : undefined,
          ratedPower,
        },
      });
      // 强制更新 funcs 字段（Prisma upsert 不比较 JSON 列的变化）
      await prisma.$executeRaw`
        UPDATE Device SET funcs = ${JSON.stringify(deviceFuncs)} WHERE id = ${deviceId}
      `;
    }

    const devices = await prisma.device.findMany({
      include: { room: true },
      orderBy: { name: "asc" },
    });

    // 获取今日能耗数据
    const today = new Date().toISOString().split("T")[0];
    const energyRecords = await prisma.energyRecord.findMany({
      where: { date: today, deviceId: { in: devices.map((d) => d.id) } },
    });
    const energyMap = new Map(energyRecords.map((r) => [r.deviceId, r]));
    const devicesWithEnergy = devices.map((d) => {
      const energy = energyMap.get(d.id);
      return {
        ...d,
        funcs: (() => { try { return JSON.parse(d.funcs) as number[]; } catch { return []; } })(),
        power: energy?.peakWatts ?? null,
        todayKwh: energy?.kwh ?? null,
      };
    });

    return Response.json({ result: "ok", count: devicesWithEnergy.length, devices: devicesWithEnergy });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
