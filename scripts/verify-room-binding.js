/**
 * 验证设备房间绑定修复
 * 从 groups 字段提取 roomId 并更新数据库
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyRoomBinding() {
  console.log('=== 设备房间绑定验证脚本 ===\n');

  // 1. 统计当前状态
  const beforeStats = await prisma.device.aggregate({
    _count: {
      roomId: true,
      _all: true,
    },
  });

  const devicesWithGroups = await prisma.device.count({
    where: {
      groups: { contains: '[0,' },
    },
  });

  console.log('当前状态：');
  console.log(`- 总设备数：${beforeStats._count._all}`);
  console.log(`- 有 roomId 的设备：${beforeStats._count.roomId}`);
  console.log(`- 没有 roomId 的设备：${beforeStats._count._all - beforeStats._count.roomId}`);
  console.log(`- groups 有数据的设备：${devicesWithGroups}\n`);

  // 2. 找出需要更新的设备（有 groups 但没有 roomId）
  const devicesToFix = await prisma.device.findMany({
    where: {
      roomId: null,
      groups: { contains: '[0,' },
    },
    select: {
      id: true,
      name: true,
      groups: true,
    },
  });

  console.log(`找到 ${devicesToFix.length} 个待绑定设备\n`);

  if (devicesToFix.length === 0) {
    console.log('没有需要更新的设备');
    return;
  }

  // 3. 显示前 5 个示例
  console.log('示例设备（前 5 个）：');
  for (const device of devicesToFix.slice(0, 5)) {
    console.log(`- ${device.name} (${device.id})`);
    console.log(`  groups: ${device.groups}`);
  }
  console.log('\n');

  // 4. 应用修复逻辑
  console.log('开始应用 groups → roomId 转换...\n');

  let successCount = 0;
  let failCount = 0;

  for (const device of devicesToFix) {
    try {
      // 解析 groups
      const groups = JSON.parse(device.groups);

      // 验证格式：[0, room_id]
      if (!Array.isArray(groups) || groups.length < 2) {
        console.log(`⚠️  ${device.name}: groups 格式无效 (${device.groups})`);
        failCount++;
        continue;
      }

      const groupId = groups[1];
      if (!groupId || groupId === 0) {
        console.log(`⚠️  ${device.name}: groups[1] 无效 (${groupId})`);
        failCount++;
        continue;
      }

      const roomId = String(groupId);

      // 检查房间是否存在
      const roomExists = await prisma.room.findUnique({
        where: { id: roomId },
      });

      if (!roomExists) {
        console.log(`⚠️  ${device.name}: 房间 ${roomId} 不存在`);
        failCount++;
        continue;
      }

      // 更新设备的 roomId
      await prisma.device.update({
        where: { id: device.id },
        data: { roomId },
      });

      console.log(`✅ ${device.name}: 绑定到房间 "${roomExists.name}" (${roomId})`);
      successCount++;

    } catch (err) {
      console.log(`❌ ${device.name}: 更新失败 (${err.message})`);
      failCount++;
    }
  }

  console.log('\n=== 更新完成 ===\n');
  console.log(`成功：${successCount} 个设备`);
  console.log(`失败：${failCount} 个设备\n`);

  // 5. 统计更新后的状态
  const afterStats = await prisma.device.aggregate({
    _count: {
      roomId: true,
      _all: true,
    },
  });

  console.log('更新后状态：');
  console.log(`- 总设备数：${afterStats._count._all}`);
  console.log(`- 有 roomId 的设备：${afterStats._count.roomId}`);
  console.log(`- 没有 roomId 的设备：${afterStats._count._all - afterStats._count.roomId}`);
  console.log(`- 新增绑定：${afterStats._count.roomId - beforeStats._count.roomId} 个设备\n`);

  // 6. 验证几个示例设备的绑定结果
  console.log('验证示例设备：');
  const sampleDevices = await prisma.device.findMany({
    where: {
      id: { in: devicesToFix.slice(0, 3).map(d => d.id) },
    },
    include: {
      room: true,
    },
  });

  for (const device of sampleDevices) {
    if (device.room) {
      console.log(`✅ ${device.name}: 已绑定到 "${device.room.name}" (roomId=${device.roomId})`);
    } else {
      console.log(`❌ ${device.name}: 未绑定 (roomId=${device.roomId})`);
    }
  }

  await prisma.$disconnect();
}

verifyRoomBinding().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});