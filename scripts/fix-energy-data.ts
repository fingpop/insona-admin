import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixEnergyData() {
  console.log("开始修复能耗数据...");

  // 获取所有能耗记录
  const records = await prisma.energyRecord.findMany();

  console.log(`共有 ${records.length} 条能耗记录`);

  for (const record of records) {
    const correctedKwh = record.kwh / 100;

    await prisma.energyRecord.update({
      where: { id: record.id },
      data: { kwh: correctedKwh },
    });

    console.log(`设备 ${record.deviceId}: ${record.kwh} -> ${correctedKwh}`);
  }

  console.log("能耗数据修复完成！");
}

fixEnergyData()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
