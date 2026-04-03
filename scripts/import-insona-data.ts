/**
 * 导入 insona-devices.json 数据到数据库
 *
 * 使用方法: npx tsx scripts/import-insona-data.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

interface InSonaRoom {
  roomId: number;
  name: string;
}

interface InSonaDevice {
  did: string;
  pid: number;
  ver: string;
  type: number;
  alive: number;
  roomId: number;
  name: string;
  func: number;
  funcs: number[];
  value: number[];
  groups?: number[];
  meshid: string;
}

interface InSonaData {
  version: number;
  uuid: number;
  method: string;
  result: string;
  rooms: InSonaRoom[];
  devices: InSonaDevice[];
}

async function main() {
  console.log('开始导入数据...');

  // 读取 JSON 文件
  const filePath = path.join(process.cwd(), 'insona-devices.json');
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const data: InSonaData = JSON.parse(rawData);

  console.log(`读取到 ${data.rooms.length} 个房间和 ${data.devices.length} 个设备`);

  // 1. 导入房间数据（创建空间层级）
  console.log('\n导入房间数据...');
  for (const room of data.rooms) {
    try {
      // 检查房间是否已存在
      const existingRoom = await prisma.room.findFirst({
        where: { name: room.name }
      });

      if (existingRoom) {
        console.log(`  房间已存在: ${room.name} (ID: ${existingRoom.id})`);
        continue;
      }

      // 创建房间（根据命名规则推断层级）
      const roomType = inferRoomType(room.name);
      const createdRoom = await prisma.room.create({
        data: {
          id: `room_${room.roomId}`,
          name: room.name,
          type: roomType,
        }
      });
      console.log(`  ✓ 创建房间: ${room.name} (类型: ${roomType})`);
    } catch (error) {
      console.error(`  ✗ 创建房间失败 ${room.name}:`, error);
    }
  }

  // 2. 导入设备数据
  console.log('\n导入设备数据...');
  for (const device of data.devices) {
    try {
      // 检查设备是否已存在
      const existingDevice = await prisma.device.findUnique({
        where: { id: device.did }
      });

      if (existingDevice) {
        // 更新设备信息
        await prisma.device.update({
          where: { id: device.did },
          data: {
            pid: device.pid,
            ver: device.ver,
            type: device.type,
            alive: device.alive,
            gatewayName: device.name,
            func: device.func,
            funcs: JSON.stringify(device.funcs),
            value: JSON.stringify(device.value),
            groups: JSON.stringify(device.groups || []),
            meshId: device.meshid || null,
            roomId: device.roomId ? `room_${device.roomId}` : null,
          }
        });
        console.log(`  ✓ 更新设备: ${device.did} - ${device.name}`);
      } else {
        // 创建新设备
        await prisma.device.create({
          data: {
            id: device.did,
            pid: device.pid,
            ver: device.ver,
            type: device.type,
            alive: device.alive,
            name: device.name, // 初始名称使用网关名称
            gatewayName: device.name,
            func: device.func,
            funcs: JSON.stringify(device.funcs),
            value: JSON.stringify(device.value),
            groups: JSON.stringify(device.groups || []),
            meshId: device.meshid || null,
            roomId: device.roomId ? `room_${device.roomId}` : null,
            ratedPower: inferRatedPower(device.type),
          }
        });
        console.log(`  ✓ 创建设备: ${device.did} - ${device.name}`);
      }
    } catch (error) {
      console.error(`  ✗ 导入设备失败 ${device.did}:`, error);
    }
  }

  // 3. 统计信息
  const totalRooms = await prisma.room.count();
  const totalDevices = await prisma.device.count();
  const onlineDevices = await prisma.device.count({ where: { alive: 1 } });
  const offlineDevices = await prisma.device.count({ where: { alive: 0 } });

  console.log('\n导入完成！');
  console.log(`  房间总数: ${totalRooms}`);
  console.log(`  设备总数: ${totalDevices}`);
  console.log(`  在线设备: ${onlineDevices}`);
  console.log(`  离线设备: ${offlineDevices}`);
}

/**
 * 根据房间名称推断房间类型
 */
function inferRoomType(name: string): string {
  if (name.includes('F') && name.match(/\dF/)) {
    // 包含楼层标识（如 "1F大厅", "2F办公室", "3F茶水间"）
    const floorMatch = name.match(/(\d)F/);
    if (floorMatch && !name.includes('会议室') && !name.includes('办公室') && !name.includes('卫生间')) {
      return 'floor';
    }
  }
  // 默认为房间
  return 'room';
}

/**
 * 根据设备类型推断额定功率
 */
function inferRatedPower(type: number): number {
  const powerMap: Record<number, number> = {
    1984: 10,    // 灯具
    1860: 30,    // 开合帘
    1861: 30,    // 卷帘
    1862: 30,    // 开合帘带角度
    1218: 2,     // 面板
    1344: 0.5,   // 传感器
  };
  return powerMap[type] || 10;
}

main()
  .catch((error) => {
    console.error('导入失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });