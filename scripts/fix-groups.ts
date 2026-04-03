/**
 * 修复设备的 groups 数据
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface InSonaDevice {
  did: string;
  name: string;
  groups?: number[];
}

interface InSonaData {
  devices: InSonaDevice[];
}

async function main() {
  console.log('开始修复 groups 数据...');

  // 读取 JSON 文件
  const filePath = path.join(process.cwd(), 'insona-devices.json');
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const data: InSonaData = JSON.parse(rawData);

  console.log(`读取到 ${data.devices.length} 个设备`);

  let updatedCount = 0;
  let errorCount = 0;

  // 更新每个设备的 groups
  for (const device of data.devices) {
    try {
      const groupsJson = JSON.stringify(device.groups || []);

      await prisma.device.update({
        where: { id: device.did },
        data: { groups: groupsJson }
      });

      updatedCount++;
      console.log(`✓ 更新设备 ${device.did}: groups=${groupsJson}`);
    } catch (error) {
      errorCount++;
      console.error(`✗ 更新失败 ${device.did}:`, error);
    }
  }

  console.log(`\n修复完成!`);
  console.log(`  成功更新: ${updatedCount} 个设备`);
  console.log(`  失败: ${errorCount} 个设备`);

  // 验证结果
  const devicesWithGroups = await prisma.device.findMany({
    where: {
      groups: { not: '[]' }
    },
    take: 5
  });

  console.log('\n验证结果(前5个有groups的设备):');
  devicesWithGroups.forEach(d => {
    console.log(`  ${d.id} - ${d.gatewayName}: ${d.groups}`);
  });
}

main()
  .catch((error) => {
    console.error('修复失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });