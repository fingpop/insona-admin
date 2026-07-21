/**
 * 修复能耗数据的时区问题
 *
 * 背景：旧代码使用 new Date().toISOString() 获取日期/小时，
 *       在 UTC+8 下凌晨 00:00-07:59 的数据会被记录到前一天，小时也偏小 8。
 *
 * 本脚本：
 *   1. 修正 EnergyData.date       —— 基于 timestamp 转 UTC+8 日期
 *   2. 修正 EnergyHourly.date/hour —— 把 (date,hour) 视为 UTC，转 UTC+8
 *   3. 修正 EnergyRecord.date      —— 只修正确实因 UTC 偏移到错误日期的记录，
 *                                    与已有记录合并（kwh 相加，peakWatts 取大）
 *
 * 使用：
 *   npx tsx scripts/fix-energy-timezone.ts            # 实际执行
 *   npx tsx scripts/fix-energy-timezone.ts --dry-run  # 仅预览
 *   npx tsx scripts/fix-energy-timezone.ts --force    # 强制重跑（忽略已修复标记）
 *
 * ⚠️  本脚本不是幂等的！跑过一次后再跑会把已修正的数据再次错误偏移。
 *     脚本会在 SystemSetting 表写入标记 `timezone_fix_applied`，
 *     下次运行会自动检测并拒绝执行。确需重跑请加 --force。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 显式 +8 小时，保证跨环境一致
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const MARKER_KEY = "timezone_fix_applied";

function toLocalDate(d: Date): string {
  const local = new Date(d.getTime() + TZ_OFFSET_MS);
  return local.toISOString().split("T")[0];
}

function toLocalHour(d: Date): number {
  const local = new Date(d.getTime() + TZ_OFFSET_MS);
  return Number(local.toISOString().split("T")[1].split(":")[0]);
}

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

async function main() {
  console.log(`\n=== 能耗数据时区修复 ${DRY_RUN ? "[预览模式]" : "[执行模式]"}${FORCE ? " [强制模式]" : ""} ===\n`);

  // ============================================================
  // 0. 幂等性检查：避免重复执行
  // ============================================================
  if (!FORCE) {
    const marker = await prisma.systemSetting.findUnique({ where: { key: MARKER_KEY } });
    if (marker) {
      console.log(`⚠️  检测到修复标记（${marker.value}），数据已修复过。`);
      console.log(`   如需强制重跑请添加 --force 参数\n`);
      return;
    }
  }

  // ============================================================
  // 1. EnergyData: 用 timestamp 作为真实时间，重算 date
  // ============================================================
  console.log("[1/3] EnergyData：用 timestamp 重算 date");
  const allData = await prisma.energyData.findMany({
    select: { id: true, date: true, timestamp: true },
  });
  const dataFixes: Array<{ id: string; oldDate: string; newDate: string }> = [];
  for (const r of allData) {
    const correct = toLocalDate(r.timestamp);
    if (correct !== r.date) dataFixes.push({ id: r.id, oldDate: r.date, newDate: correct });
  }
  console.log(`  总数 ${allData.length}，需修正 ${dataFixes.length}`);

  if (!DRY_RUN && dataFixes.length > 0) {
    await prisma.$transaction(
      dataFixes.map((f) =>
        prisma.energyData.update({ where: { id: f.id }, data: { date: f.newDate } }),
      ),
    );
    for (const f of dataFixes.slice(0, 5)) {
      console.log(`    ${f.oldDate} → ${f.newDate}`);
    }
  }

  // ============================================================
  // 2. EnergyHourly: (date,hour) 视为 UTC，转为 UTC+8 本地
  //    唯一约束 (deviceId, date, hour)，冲突时合并
  // ============================================================
  console.log("\n[2/3] EnergyHourly：(date,hour) UTC → UTC+8");
  const allHourly = await prisma.energyHourly.findMany();
  const hourlyFixes: Array<{
    oldId: string;
    deviceId: string;
    newDate: string;
    newHour: number;
    kwh: number;
    peakWatts: number;
    dataCount: number;
    oldDate: string;
    oldHour: number;
  }> = [];
  for (const r of allHourly) {
    const utcDate = new Date(`${r.date}T${String(r.hour).padStart(2, "0")}:00:00.000Z`);
    const newDate = toLocalDate(utcDate);
    const newHour = toLocalHour(utcDate);
    if (newDate !== r.date || newHour !== r.hour) {
      hourlyFixes.push({
        oldId: r.id,
        deviceId: r.deviceId,
        newDate,
        newHour,
        kwh: r.kwh,
        peakWatts: r.peakWatts,
        dataCount: r.dataCount,
        oldDate: r.date,
        oldHour: r.hour,
      });
    }
  }
  console.log(`  总数 ${allHourly.length}，需修正 ${hourlyFixes.length}`);
  if (hourlyFixes.length > 0) {
    const samples = hourlyFixes.slice(0, 5);
    for (const f of samples) {
      console.log(`    ${f.oldDate} ${String(f.oldHour).padStart(2, "0")}:00 → ${f.newDate} ${String(f.newHour).padStart(2, "0")}:00`);
    }
    if (hourlyFixes.length > 5) console.log(`    ... 还有 ${hourlyFixes.length - 5} 条`);
  }

  if (!DRY_RUN && hourlyFixes.length > 0) {
    await prisma.$transaction(async (tx) => {
      // 先删除所有待修正的旧记录
      await tx.energyHourly.deleteMany({
        where: { id: { in: hourlyFixes.map((f) => f.oldId) } },
      });
      // 逐条插入，唯一约束冲突时合并
      for (const f of hourlyFixes) {
        const existing = await tx.energyHourly.findUnique({
          where: {
            deviceId_date_hour: { deviceId: f.deviceId, date: f.newDate, hour: f.newHour },
          },
        });
        if (existing) {
          await tx.energyHourly.update({
            where: { id: existing.id },
            data: {
              kwh: existing.kwh + f.kwh,
              peakWatts: Math.max(existing.peakWatts, f.peakWatts),
              dataCount: existing.dataCount + f.dataCount,
            },
          });
        } else {
          await tx.energyHourly.create({
            data: {
              deviceId: f.deviceId,
              date: f.newDate,
              hour: f.newHour,
              kwh: f.kwh,
              peakWatts: f.peakWatts,
              dataCount: f.dataCount,
            },
          });
        }
      }
    });
  }

  // ============================================================
  // 3. EnergyRecord: 基于 EnergyHourly 的移动，同步修正 date
  //    旧 (deviceId, date) 的聚合 → 新 (deviceId, newDate)
  //    冲突时合并（kwh 相加，peakWatts 取大）
  //    没有任何 EnergyHourly 佐证的陈旧记录保持不动
  // ============================================================
  console.log("\n[3/3] EnergyRecord：基于 EnergyHourly 的移动同步修正");

  // 建立 oldDate → newDate 的映射（从 EnergyHourly 的修正结果中推导）
  const dateMoveMap = new Map<string, Set<string>>(); // oldDate → Set<newDate>
  for (const f of hourlyFixes) {
    if (!dateMoveMap.has(f.oldDate)) dateMoveMap.set(f.oldDate, new Set());
    dateMoveMap.get(f.oldDate)!.add(f.newDate);
  }

  // 找出所有可能需要移动的 EnergyRecord
  const oldDates = Array.from(dateMoveMap.keys());
  const candidates = oldDates.length > 0
    ? await prisma.energyRecord.findMany({ where: { date: { in: oldDates } } })
    : [];
  console.log(`  候选记录 ${candidates.length}（date 在 ${oldDates.join(", ") || "无"}）`);

  // 计算每条记录应该移动到哪个 newDate
  // 注意：同一个 oldDate 的 EnergyHourly 可能分散到多个 newDate（例如 2026-05-26 16:00 UTC → 2026-05-27 00:00 local）
  // 对 EnergyRecord 这种日聚合，最安全的做法是按 deviceId 维度，根据该 deviceId 在 oldDate 下所有 EnergyHourly 修正后的主要 newDate 来归属
  // 简化：按 (deviceId, oldDate) 聚合所有修正后的 EnergyHourly，取 kwh 占比最大的 newDate 作为 EnergyRecord 的新 date
  const recordFixes: Array<{ id: string; oldDate: string; newDate: string; newKwh: number; newPeak: number }> = [];

  for (const oldDate of oldDates) {
    // 找出该 oldDate 下所有 EnergyHourly 修正后落到哪些 (deviceId, newDate)
    const perDevice = new Map<string, Map<string, { kwh: number; peak: number }>>();
    for (const f of hourlyFixes.filter((h) => h.oldDate === oldDate)) {
      if (!perDevice.has(f.deviceId)) perDevice.set(f.deviceId, new Map());
      const devMap = perDevice.get(f.deviceId)!;
      const agg = devMap.get(f.newDate) ?? { kwh: 0, peak: 0 };
      agg.kwh += f.kwh;
      agg.peak = Math.max(agg.peak, f.peakWatts);
      devMap.set(f.newDate, agg);
    }

    // 对每个 deviceId，找 kwh 最大的 newDate 作为归属
    const deviceTargetDate = new Map<string, { newDate: string; kwh: number; peak: number }>();
    for (const [deviceId, devMap] of perDevice) {
      let best = { newDate: "", kwh: -1, peak: 0 };
      for (const [newDate, agg] of devMap) {
        if (agg.kwh > best.kwh) best = { newDate, kwh: agg.kwh, peak: agg.peak };
      }
      deviceTargetDate.set(deviceId, best);
    }

    // 找出该 oldDate 的所有 EnergyRecord，按归属重新分配
    const oldRecords = candidates.filter((r) => r.date === oldDate);
    for (const rec of oldRecords) {
      const target = deviceTargetDate.get(rec.deviceId);
      if (!target) {
        // 该 deviceId 没有任何 EnergyHourly 移动，记录保持不动
        continue;
      }
      if (target.newDate === rec.date) {
        // 目标日期和原日期相同，无需移动
        continue;
      }
      recordFixes.push({
        id: rec.id,
        oldDate: rec.date,
        newDate: target.newDate,
        newKwh: target.kwh,
        newPeak: target.peak,
      });
    }
  }

  console.log(`  需移动 ${recordFixes.length} 条`);
  for (const f of recordFixes.slice(0, 5)) {
    console.log(`    device ${f.id.slice(-8)}: ${f.oldDate} → ${f.newDate}`);
  }

  if (!DRY_RUN && recordFixes.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const f of recordFixes) {
        // 先看目标 (deviceId, newDate) 是否已有记录
        const rec = await tx.energyRecord.findFirst({
          where: {
            deviceId: (await tx.energyRecord.findUnique({ where: { id: f.id } }))!.deviceId,
            date: f.newDate,
          },
        });
        const oldRec = await tx.energyRecord.findUnique({ where: { id: f.id } });
        if (!oldRec) continue;
        if (rec && rec.id !== f.id) {
          // 合并到已存在的记录
          await tx.energyRecord.update({
            where: { id: rec.id },
            data: {
              kwh: rec.kwh + oldRec.kwh,
              peakWatts: Math.max(rec.peakWatts, oldRec.peakWatts),
            },
          });
          await tx.energyRecord.delete({ where: { id: f.id } });
        } else {
          // 直接更新日期
          await tx.energyRecord.update({
            where: { id: f.id },
            data: { date: f.newDate },
          });
        }
      }
    });
  }

  // ============================================================
  // 4. 最终对齐：让 EnergyRecord 完全匹配 EnergyHourly 的 (deviceId, date) 聚合
  //    处理跨日期设备的日报拆分、合并、kwh 校准
  // ============================================================
  console.log("\n[4/4] 最终对齐：EnergyRecord 按 EnergyHourly 真实聚合校准");
  const allHourly2 = await prisma.energyHourly.findMany({
    select: { deviceId: true, date: true, kwh: true, peakWatts: true },
  });
  const actualAgg = new Map<string, { kwh: number; peak: number }>();
  for (const h of allHourly2) {
    const key = `${h.deviceId}::${h.date}`;
    const a = actualAgg.get(key) ?? { kwh: 0, peak: 0 };
    a.kwh += h.kwh;
    a.peak = Math.max(a.peak, h.peakWatts);
    actualAgg.set(key, a);
  }
  const allRecords = await prisma.energyRecord.findMany();
  const recByKey = new Map(allRecords.map((r) => [`${r.deviceId}::${r.date}`, r]));

  const toCreate: Array<{ deviceId: string; date: string; kwh: number; peakWatts: number }> = [];
  const toUpdate: Array<{ id: string; kwh: number; peakWatts: number }> = [];
  const toDelete: string[] = [];

  for (const [key, actual] of actualAgg) {
    const rec = recByKey.get(key);
    if (!rec) {
      toCreate.push({
        deviceId: key.split("::")[0],
        date: key.split("::")[1],
        kwh: actual.kwh,
        peakWatts: actual.peak,
      });
    } else if (Math.abs(rec.kwh - actual.kwh) > 0.0001 || Math.abs(rec.peakWatts - actual.peak) > 0.01) {
      toUpdate.push({ id: rec.id, kwh: actual.kwh, peakWatts: actual.peak });
    }
  }
  for (const [key, rec] of recByKey) {
    if (!actualAgg.has(key)) toDelete.push(rec.id);
  }
  console.log(`  新增 ${toCreate.length}，更新 ${toUpdate.length}，删除 ${toDelete.length}`);

  if (!DRY_RUN) {
    await prisma.$transaction(async (tx) => {
      if (toDelete.length) await tx.energyRecord.deleteMany({ where: { id: { in: toDelete } } });
      for (const u of toUpdate) {
        await tx.energyRecord.update({ where: { id: u.id }, data: { kwh: u.kwh, peakWatts: u.peakWatts } });
      }
      if (toCreate.length) await tx.energyRecord.createMany({ data: toCreate });
    });
  }

  // ============================================================
  // 写修复标记（防止重复执行）
  // ============================================================
  if (!DRY_RUN) {
    await prisma.systemSetting.upsert({
      where: { key: MARKER_KEY },
      create: {
        key: MARKER_KEY,
        value: new Date().toISOString(),
      },
      update: {
        value: new Date().toISOString(),
      },
    });
  }

  // ============================================================
  // 完成
  // ============================================================
  console.log(`\n=== 完成 ${DRY_RUN ? "（预览模式，未实际写入）" : ""} ===`);
  console.log(`  EnergyData   修正 ${dataFixes.length} 条`);
  console.log(`  EnergyHourly 修正 ${hourlyFixes.length} 条`);
  console.log(`  EnergyRecord 移动 ${recordFixes.length} 条，对齐新增 ${toCreate.length} 更新 ${toUpdate.length} 删除 ${toDelete.length}`);
  if (!DRY_RUN) console.log(`  ✓ 已写入修复标记，重复运行将被拒绝（可用 --force 强制）`);
  console.log();
}

main()
  .catch((e) => {
    console.error("修复失败:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
