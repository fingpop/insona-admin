#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  console.log('\n=== Prisma Client Debug ===\n');

  // 测试连接
  try {
    const deviceCount = await prisma.device.count();
    console.log('✅ Device count:', deviceCount);
  } catch (err) {
    console.log('❌ Device query failed:', err.message);
  }

  // 测试 EnergyData
  try {
    const energyCount = await prisma.energyData.count();
    console.log('✅ EnergyData count:', energyCount);

    // 查询最新的 5 条记录
    const latestEnergy = await prisma.energyData.findMany({
      take: 5,
      orderBy: { sequence: 'desc' },
      include: { device: { select: { name: true } } }
    });

    console.log('\n📊 Latest 5 EnergyData records:');
    latestEnergy.forEach((record, i) => {
      console.log(`${i + 1}. Device: ${record.device.name} (${record.deviceId})`);
      console.log(`   Sequence: ${record.sequence}, kWh: ${record.kwh.toFixed(3)}, Percent: ${record.percent}%`);
      console.log(`   Date: ${record.date}, Timestamp: ${new Date(record.timestamp).toLocaleString()}\n`);
    });

    // 统计每个设备的记录数
    const deviceStats = await prisma.energyData.groupBy({
      by: ['deviceId'],
      _count: { id: true },
      _max: { sequence: true },
      _min: { sequence: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    });

    console.log('📈 Top 10 devices by EnergyData count:');
    deviceStats.forEach((stat, i) => {
      const range = stat._max.sequence - stat._min.sequence + 1;
      console.log(`${i + 1}. Device ${stat.deviceId}: ${stat._count.id} records (sequence range: ${range})`);
    });

  } catch (err) {
    console.log('❌ EnergyData query failed:', err.message);
    console.log('\n可能的原因：');
    console.log('1. Prisma Client 未正确生成（运行: npx prisma generate）');
    console.log('2. 数据库文件路径错误（检查 .env 中的 DATABASE_URL）');
    console.log('3. EnergyData 表不存在（运行: npm run db:deploy）');
  }

  // 测试 EnergyRecord
  try {
    const recordCount = await prisma.energyRecord.count();
    console.log('\n✅ EnergyRecord count:', recordCount);
  } catch (err) {
    console.log('❌ EnergyRecord query failed:', err.message);
  }

  await prisma.$disconnect();
  console.log('\n✅ Prisma Client 已断开连接\n');
}

debug().catch(console.error);