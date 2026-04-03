import { NextRequest, NextResponse } from 'next/server';
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

/**
 * POST /api/import-data
 * 从 insona-devices.json 导入数据到数据库
 */
export async function POST(request: NextRequest) {
  try {
    // 读取 JSON 文件
    const filePath = path.join(process.cwd(), 'insona-devices.json');

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'insona-devices.json 文件不存在' },
        { status: 400 }
      );
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const data: InSonaData = JSON.parse(rawData);

    console.log(`开始导入: ${data.rooms.length} 个房间, ${data.devices.length} 个设备`);

    // 1. 导入房间数据
    const roomsResult = [];
    for (const room of data.rooms) {
      try {
        // 检查房间是否已存在(用数字ID)
        const existingRoom = await prisma.room.findUnique({
          where: { id: String(room.roomId) }
        });

        if (existingRoom) {
          // 更新房间名称
          await prisma.room.update({
            where: { id: String(room.roomId) },
            data: { name: room.name }
          });
          roomsResult.push({
            id: existingRoom.id,
            name: room.name,
            status: 'updated'
          });
          continue;
        }

        // 创建房间(用数字ID)
        const roomType = inferRoomType(room.name);
        const createdRoom = await prisma.room.create({
          data: {
            id: String(room.roomId), // 直接使用数字ID
            name: room.name,
            type: roomType,
          }
        });
        roomsResult.push({
          id: createdRoom.id,
          name: room.name,
          status: 'created'
        });
      } catch (error) {
        console.error(`创建房间失败 ${room.name}:`, error);
      }
    }

    // 2. 导入设备数据
    const devicesResult = [];
    for (const device of data.devices) {
      try {
        // 解析groups数据
        const groupsArray = device.groups || [];
        const groupsJson = JSON.stringify(groupsArray);

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
              groups: groupsJson, // 更新groups
              meshId: device.meshid || null,
              roomId: device.roomId ? String(device.roomId) : null, // 使用数字ID
            }
          });
          devicesResult.push({
            did: device.did,
            name: device.name,
            status: 'updated',
            groups: groupsArray
          });
        } else {
          // 创建新设备
          await prisma.device.create({
            data: {
              id: device.did,
              pid: device.pid,
              ver: device.ver,
              type: device.type,
              alive: device.alive,
              name: device.name,
              gatewayName: device.name,
              func: device.func,
              funcs: JSON.stringify(device.funcs),
              value: JSON.stringify(device.value),
              groups: groupsJson, // 设置groups
              meshId: device.meshid || null,
              roomId: device.roomId ? String(device.roomId) : null, // 使用数字ID
              ratedPower: inferRatedPower(device.type),
            }
          });
          devicesResult.push({
            did: device.did,
            name: device.name,
            status: 'created',
            groups: groupsArray
          });
        }
      } catch (error) {
        console.error(`导入设备失败 ${device.did}:`, error);
        devicesResult.push({
          did: device.did,
          name: device.name,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // 3. 统计信息
    const totalRooms = await prisma.room.count();
    const totalDevices = await prisma.device.count();
    const onlineDevices = await prisma.device.count({ where: { alive: 1 } });
    const offlineDevices = await prisma.device.count({ where: { alive: 0 } });

    return NextResponse.json({
      success: true,
      message: '数据导入成功',
      summary: {
        totalRooms,
        totalDevices,
        onlineDevices,
        offlineDevices,
      },
      details: {
        rooms: roomsResult,
        devices: devicesResult,
      }
    });
  } catch (error) {
    console.error('导入数据失败:', error);
    return NextResponse.json(
      { error: '导入数据失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * 根据房间名称推断房间类型
 */
function inferRoomType(name: string): string {
  if (name.includes('F') && name.match(/\dF/)) {
    const floorMatch = name.match(/(\d)F/);
    if (floorMatch && !name.includes('会议室') && !name.includes('办公室') && !name.includes('卫生间')) {
      return 'floor';
    }
  }
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