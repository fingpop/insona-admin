import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isGroupDevice } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  const roomId = searchParams.get("roomId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  // Build device filter
  let deviceIds: string[] | undefined;
  if (deviceId) {
    deviceIds = [deviceId];
  } else if (roomId) {
    const devices = await prisma.device.findMany({
      where: { roomId },
      select: { id: true },
    });
    deviceIds = devices.map((d) => d.id);
  }

  const where: Record<string, unknown> = {};
  if (deviceIds) where.deviceId = { in: deviceIds };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, string>).gte = from;
    if (to) (where.date as Record<string, string>).lte = to;
  }

  const records = await prisma.energyRecord.findMany({
    where,
    include: { device: { include: { room: true } } },
    orderBy: { date: "desc" },
  });

  // Aggregate totals
  const totals = records.reduce(
    (acc, r) => ({
      kwh: acc.kwh + r.kwh,
      peakWatts: Math.max(acc.peakWatts, r.peakWatts),
    }),
    { kwh: 0, peakWatts: 0 }
  );

  // Daily totals - if filtering by room, only include devices in that room
  let dailyWhere = { ...where };
  if (roomId && !deviceId) {
    // Need to filter by specific devices in the room
    const devices = await prisma.device.findMany({
      where: { roomId },
      select: { id: true },
    });
    dailyWhere.deviceId = { in: devices.map((d) => d.id) };
  }

  const dailyTotals = await prisma.energyRecord.groupBy({
    by: ["date"],
    _sum: { kwh: true },
    where: dailyWhere,
    orderBy: { date: "asc" },
  });

  return Response.json({ records, totals, dailyTotals });
}

// 接收网关能耗数据上报
export async function POST(request: Request) {
  try {
    const { did, power, percent, period, energy, meshid } = await request.json();

    if (!did) {
      return NextResponse.json({ error: "缺少设备ID" }, { status: 400 });
    }

    // 调试日志
    console.log("[ENERGY API]", { did, meshid, power, percent, period, energy });

    // 组设备不需要计算能耗
    if (isGroupDevice(did)) {
      return Response.json({ success: true, skipped: "group device" });
    }

    const today = new Date().toISOString().split("T")[0];

    // 直接用原始 did 作为存储 ID
    const deviceId = did;

    // 检查设备是否存在（可能还没同步）
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      // 设备不存在，跳过
      console.log("[ENERGY API] Device not found:", deviceId);
      return Response.json({ success: true, skipped: "device not found" });
    }

    // 累加到当天的能耗记录
    const existing = await prisma.energyRecord.findUnique({
      where: { deviceId_date: { deviceId, date: today } },
    });

    if (existing) {
      await prisma.energyRecord.update({
        where: { deviceId_date: { deviceId, date: today } },
        data: {
          kwh: existing.kwh + (energy ?? 0),
          peakWatts: Math.max(existing.peakWatts, power ?? 0),
        },
      });
      console.log("[ENERGY API] Updated:", deviceId, { newKwh: existing.kwh + (energy ?? 0) });
    } else {
      await prisma.energyRecord.create({
        data: {
          deviceId,
          date: today,
          kwh: energy ?? 0,
          peakWatts: power ?? 0,
        },
      });
      console.log("[ENERGY API] Created:", deviceId, { kwh: energy ?? 0 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error("Energy data error:", err);
    return NextResponse.json({ error: "保存能耗数据失败" }, { status: 500 });
  }
}
