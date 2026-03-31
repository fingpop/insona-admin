#!/usr/bin/env node
/**
 * 能耗数据查询和验证工具
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deviceId = 'ECC57FB5134F00';
  const today = new Date().toISOString().split('T')[0];

  console.log('='.repeat(80));
  console.log('能耗数据统计报告');
  console.log('='.repeat(80));
  console.log(`设备ID: ${deviceId}`);
  console.log(`日期: ${today}`);
  console.log('');

  // 查询今日能耗数据
  const todayData = await prisma.energyData.findMany({
    where: { deviceId, date: today },
    orderBy: { sequence: 'desc' },
    take: 10
  });

  console.log('📊 今日最新10条记录');
  console.log('-'.repeat(80));
  if (todayData.length === 0) {
    console.log('暂无数据');
  } else {
    console.log('序号    | 百分比 | 能耗(kWh)    | 时间');
    console.log('-'.repeat(80));
    todayData.forEach(d => {
      const time = d.timestamp.toTimeString().slice(0, 8);
      console.log(`${d.sequence} | ${d.percent}%    | ${d.kwh.toFixed(6)} | ${time}`);
    });
  }
  console.log('');

  // 统计信息
  const stats = await prisma.energyData.aggregate({
    where: { deviceId, date: today },
    _count: true,
    _sum: { kwh: true },
    _min: { sequence: true },
    _max: { sequence: true }
  });

  console.log('📈 今日统计');
  console.log('-'.repeat(80));
  console.log(`总记录数: ${stats._count}`);
  console.log(`序号范围: ${stats._min.sequence} → ${stats._max.sequence}`);
  console.log(`总能耗: ${stats._sum.kwh?.toFixed(4) || 0} kWh`);
  console.log('');

  // 检查数据完整性
  const allData = await prisma.energyData.findMany({
    where: { deviceId, date: today },
    orderBy: { sequence: 'asc' },
    select: { sequence: true }
  });

  if (allData.length > 1) {
    let gaps = 0;
    for (let i = 1; i < allData.length; i++) {
      const prev = allData[i - 1].sequence;
      const curr = allData[i].sequence;
      if (curr !== prev + 1) {
        gaps += (curr - prev - 1);
      }
    }

    console.log('✅ 数据完整性');
    console.log('-'.repeat(80));
    console.log(`序号连续性: ${gaps === 0 ? '✓ 完整' : `丢失 ${gaps} 个`}`);
  }
  console.log('');

  // 总数据库统计
  const totalStats = await prisma.energyData.aggregate({
    where: { deviceId },
    _count: true,
    _sum: { kwh: true }
  });

  console.log('📚 历史总统计');
  console.log('-'.repeat(80));
  console.log(`总记录数: ${totalStats._count}`);
  console.log(`累计能耗: ${totalStats._sum.kwh?.toFixed(4) || 0} kWh`);
  console.log('');

  console.log('='.repeat(80));

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});