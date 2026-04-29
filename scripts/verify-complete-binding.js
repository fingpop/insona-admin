/**
 * 验证完整的设备房间绑定逻辑（groups + roomId）
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyCompleteBinding() {
  console.log('=== 完整绑定逻辑验证 ===\n');

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

  const devicesWithEmptyGroupsButRoomId = await prisma.device.count({
    where: {
      roomId: null,
      groups: '[]',
    },
  });

  console.log('当前状态：');
  console.log(`- 总设备数：${beforeStats._count._all}`);
  console.log(`- 有 roomId 的设备：${beforeStats._count.roomId}`);
  console.log(`- 没有 roomId 的设备：${beforeStats._count._all - beforeStats._count.roomId}`);
  console.log(`- groups 有数据的设备：${devicesWithGroups}`);
  console.log(`- groups 为空且无 roomId 的设备：${devicesWithEmptyGroupsButRoomId}\n`);

  // 2. 找出所有需要更新的设备
  const devicesToFix = await prisma.device.findMany({
    where: {
      roomId: null,
    },
    select: {
      id: true,
      name: true,
      groups: true,
    },
  });

  console.log(`找到 ${devicesToFix.length} 个待绑定设备\n`);

  if (devicesToFix.length === 0) {
    console.log('✅ 所有设备已绑定！');
    await prisma.$disconnect();
    return;
  }

  // 3. 应用完整逻辑（groups + roomId fallback）
  console.log('应用完整绑定逻辑（优先 groups，fallback roomId）...\n');

  let fromGroups = 0;
  let fromGatewayRoomId = 0;
  let noBinding = 0;
  let failCount = 0;

  for (const device of devicesToFix) {
    try {
      let roomId: string | undefined = undefined;
      let source = '';

      // 优先从 groups 提取
      const groups = JSON.parse(device.groups);
      if (Array.isArray(groups) && groups.length >= 2) {
        const groupId = groups[1];
        if (groupId && groupId !== 0) {
          roomId = String(groupId);
          source = 'groups';
        }
      }

      // Fallback: 使用网关返回的 roomId（模拟）
      // 在实际网关同步中，设备数据会包含 roomId 字段
      // 这里我们无法模拟，因为数据库中没有存储原始网关数据
      // 所以这部分会在实际网关同步时生效

      if (roomId) {
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

        if (source === 'groups') {
          console.log(`✅ ${device.name}: 从 groups 绑定到 "${roomExists.name}" (${roomId})`);
          fromGroups++;
        } else {
          console.log(`✅ ${device.name}: 从 roomId 绑定到 "${roomExists.name}" (${roomId})`);
          fromGatewayRoomId++;
        }
      } else {
        console.log(`⚪ ${device.name}: 无 groups 和 roomId，无法自动绑定`);
        noBinding++;
      }

    } catch (err) {
      console.log(`❌ ${device.name}: 更新失败 (${err.message})`);
      failCount++;
    }
  }

  console.log('\n=== 绑定完成 ===\n');
  console.log(`从 groups 绑定：${fromGroups} 个设备`);
  console.log(`从 roomId 绑定：${fromGatewayRoomId} 个设备`);
  console.log(`无法自动绑定：${noBinding} 个设备`);
  console.log(`失败：${failCount} 个设备\n`);

  // 4. 统计更新后的状态
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
  console.log(`- 绑定覆盖率：${((afterStats._count.roomId / afterStats._count._all) * 100).toFixed(1)}%\n`);

  await prisma.$disconnect();
}

verifyCompleteBinding().catch((err) => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});