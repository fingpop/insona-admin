// 测试能耗数据防重逻辑
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const deviceId = 'ECC57FB5134F00';

  // 1. 查询当前小时的数据
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentHour = now.getHours();

  console.log('=== 能耗数据统计 ===');
  console.log(`设备ID: ${deviceId}`);
  console.log(`日期: ${today}`);
  console.log(`当前小时: ${currentHour}`);

  // 查询明细数量
  const detailCount = await prisma.energyData.count({
    where: {
      deviceId,
      date: today
    }
  });

  console.log(`\n明细数据总数: ${detailCount} 条`);

  // 查询小时聚合
  const hourly = await prisma.energyHourly.findUnique({
    where: {
      deviceId_date_hour: {
        deviceId,
        date: today,
        hour: currentHour
      }
    }
  });

  if (hourly) {
    console.log(`\n小时聚合数据:`);
    console.log(`  - 能耗: ${hourly.kwh.toFixed(4)} kWh`);
    console.log(`  - 峰值功率: ${hourly.peakWatts.toFixed(2)} W`);
    console.log(`  - 数据点数: ${hourly.dataCount} 条`);
    console.log(`  - 明细数量: ${detailCount} 条`);

    if (hourly.dataCount !== detailCount) {
      console.log(`\n⚠️  警告: dataCount (${hourly.dataCount}) != 明细数量 (${detailCount})`);
    } else {
      console.log(`\n✅ 数据一致性检查通过`);
    }
  } else {
    console.log(`\n⚠️  当前小时没有聚合数据`);
  }

  // 查询最近的明细数据
  const recentDetails = await prisma.energyData.findMany({
    where: {
      deviceId,
      date: today
    },
    orderBy: { sequence: 'desc' },
    take: 10,
    select: { sequence: true, kwh: true, timestamp: true }
  });

  console.log(`\n最近的10条明细数据:`);
  recentDetails.forEach((d, i) => {
    const time = d.timestamp.toISOString().split('T')[1].split('.')[0];
    console.log(`  ${i + 1}. seq=${d.sequence}, kwh=${d.kwh.toFixed(4)}, time=${time}`);
  });

  await prisma.$disconnect();
}

test().catch(console.error);