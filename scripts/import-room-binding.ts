/**
 * 导入 room-binding.json 批量绑定设备到房间
 *
 * JSON 格式:
 * [
 *   { "deviceId": "ECC57F10C831FF", "roomName": "1F大厅" },
 *   { "deviceId": "ECC57F1095EA00", "roomName": "2F会议室" }
 * ]
 *
 * 使用方法: npx tsx scripts/import-room-binding.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface RoomBindingEntry {
  deviceId: string;
  roomName: string;
}

async function main() {
  console.log('开始导入设备位置绑定...\n');

  const filePath = path.join(process.cwd(), 'room-binding.json');

  if (!fs.existsSync(filePath)) {
    console.error('错误: room-binding.json 文件不存在');
    process.exit(1);
  }

  const rawData = fs.readFileSync(filePath, 'utf-8');
  const bindings: RoomBindingEntry[] = JSON.parse(rawData);

  if (!Array.isArray(bindings) || bindings.length === 0) {
    console.error('错误: 文件格式错误或数据为空');
    process.exit(1);
  }

  console.log(`读取到 ${bindings.length} 条绑定记录\n`);

  let bound = 0;
  let skipped = 0;
  let roomsCreated = 0;
  const errors: string[] = [];
  const roomCache = new Map<string, string>();

  for (const entry of bindings) {
    try {
      // 1. 查找或创建房间
      let roomId = roomCache.get(entry.roomName);

      if (!roomId) {
        const existingRoom = await prisma.room.findFirst({
          where: { name: entry.roomName }
        });

        if (existingRoom) {
          roomId = existingRoom.id;
          console.log(`  房间已存在: ${entry.roomName} (ID: ${roomId})`);
        } else {
          const newRoom = await prisma.room.create({
            data: {
              name: entry.roomName,
              type: inferRoomType(entry.roomName),
            }
          });
          roomId = newRoom.id;
          roomsCreated++;
          console.log(`  ✓ 创建房间: ${entry.roomName} (类型: ${newRoom.type})`);
        }

        roomCache.set(entry.roomName, roomId);
      }

      // 2. 查找并更新设备
      const device = await prisma.device.findUnique({
        where: { id: entry.deviceId }
      });

      if (!device) {
        console.log(`  ⊘ 跳过: 设备 ${entry.deviceId} 不存在`);
        skipped++;
        continue;
      }

      await prisma.device.update({
        where: { id: entry.deviceId },
        data: { roomId }
      });

      bound++;
      console.log(`  ✓ 绑定: ${entry.deviceId} → ${entry.roomName}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${entry.deviceId} → ${entry.roomName}: ${msg}`);
      console.log(`  ✗ 失败: ${entry.deviceId} → ${entry.roomName}: ${msg}`);
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('导入完成！');
  console.log(`  总记录数: ${bindings.length}`);
  console.log(`  成功绑定: ${bound}`);
  console.log(`  跳过(设备不存在): ${skipped}`);
  console.log(`  自动创建房间: ${roomsCreated}`);
  console.log(`  失败: ${errors.length}`);
  if (errors.length > 0) {
    console.log('\n失败详情:');
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

function inferRoomType(name: string): string {
  if (name.includes('F') && name.match(/\dF/)) {
    const floorMatch = name.match(/(\d)F/);
    if (floorMatch && !name.includes('会议室') && !name.includes('办公室') && !name.includes('卫生间')) {
      return 'floor';
    }
  }
  return 'room';
}

main()
  .catch((error) => {
    console.error('导入失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
