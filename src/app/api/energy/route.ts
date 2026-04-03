import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isGroupDevice } from "@/lib/types";

// 碳排放系数 (中国平均电网排放因子, 2024年数据)
const CARBON_EMISSION_FACTOR = 0.5586; // kgCO₂e/kWh

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

  // 从 EnergyData 表读取并汇总（而不是 EnergyRecord）
  const energyDataRecords = await prisma.energyData.findMany({
    where,
    include: { device: { include: { room: true } } },
    orderBy: { timestamp: "desc" },
  });

  // 按设备和日期汇总
  const recordsMap = new Map<string, { deviceId: string; date: string; kwh: number; peakWatts: number; device: any }>();

  for (const record of energyDataRecords) {
    const key = `${record.deviceId}_${record.date}`;
    const existing = recordsMap.get(key);
    if (existing) {
      existing.kwh += record.kwh;
      existing.peakWatts = Math.max(existing.peakWatts, record.power * (record.percent / 100));
    } else {
      recordsMap.set(key, {
        deviceId: record.deviceId,
        date: record.date,
        kwh: record.kwh,
        peakWatts: record.power * (record.percent / 100),
        device: record.device,
      });
    }
  }

  const records = Array.from(recordsMap.values());

  // Aggregate totals
  const totals = records.reduce(
    (acc, r) => ({
      kwh: acc.kwh + r.kwh,
      peakWatts: Math.max(acc.peakWatts, r.peakWatts),
      carbonEmission: acc.carbonEmission + r.kwh * CARBON_EMISSION_FACTOR,
    }),
    { kwh: 0, peakWatts: 0, carbonEmission: 0 }
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

  // 从 EnergyData 汇总每日能耗
  const dailyData = await prisma.energyData.groupBy({
    by: ["date"],
    _sum: { kwh: true },
    where: dailyWhere,
    orderBy: { date: "asc" },
  });

  const dailyTotals = dailyData.map((d) => ({
    date: d.date,
    _sum: { kwh: d._sum.kwh },
  }));

  return Response.json({ records, totals, dailyTotals });
}

// 接收网关能耗数据上报
// 协议：power(W) * percent(%) * period(min) = 能耗
export async function POST(request: Request) {
  try {
    const { did, power, percent, period, meshid } = await request.json();

    if (!did) {
      return NextResponse.json({ error: "缺少设备ID" }, { status: 400 });
    }

    // 计算本次上报的能耗 (kWh)
    // power 字段单位是 W（瓦特），表示额定功率
    // percent 是亮度百分比，折算实际功率
    // 实际功率 = power(W) × percent(%)
    // 能耗 kWh = 实际功率(W) × period(min) / 60(h) / 1000
    const actualPowerWatts = (power ?? 0) * ((percent ?? 100) / 100);
    const energyKwh = actualPowerWatts * (period ?? 0) / 60 / 1000;

    // 调试日志
    console.log("[ENERGY API]", { did, meshid, power, percent, period, actualPowerWatts, energyKwh });

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
      const newKwh = existing.kwh + energyKwh;
      const newPeakWatts = Math.max(existing.peakWatts, actualPowerWatts);
      await prisma.energyRecord.update({
        where: { deviceId_date: { deviceId, date: today } },
        data: {
          kwh: newKwh,
          peakWatts: newPeakWatts,
        },
      });
      console.log("[ENERGY API] Updated:", deviceId, { newKwh, newPeakWatts });
    } else {
      await prisma.energyRecord.create({
        data: {
          deviceId,
          date: today,
          kwh: energyKwh,
          peakWatts: actualPowerWatts,
        },
      });
      console.log("[ENERGY API] Created:", deviceId, { kwh: energyKwh, peakWatts: actualPowerWatts });
    }

    return Response.json({ success: true, calculated: { actualPowerWatts, energyKwh } });
  } catch (err) {
    console.error("Energy data error:", err);
    return NextResponse.json({ error: "保存能耗数据失败" }, { status: 500 });
  }
}
