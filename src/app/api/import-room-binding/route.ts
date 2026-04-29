import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface RoomBindingEntry {
  deviceId: string;
  roomName: string;
}

/**
 * POST /api/import-room-binding
 * 从上传的 JSON 文件批量绑定设备到房间
 *
 * 请求: multipart/form-data，字段 "file" 为 JSON 文件
 * JSON 格式:
 * [
 *   { "deviceId": "ECC57F10C831FF", "roomName": "1F大厅" },
 *   { "deviceId": "ECC57F1095EA00", "roomName": "2F会议室" }
 * ]
 *
 * 逻辑：按 roomName 匹配已有房间，找不到则自动创建
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: '未上传文件' },
        { status: 400 }
      );
    }

    const rawData = await file.text();
    let bindings: RoomBindingEntry[];
    try {
      bindings = JSON.parse(rawData);
    } catch {
      return NextResponse.json(
        { error: '文件格式错误，无法解析 JSON' },
        { status: 400 }
      );
    }

    if (!Array.isArray(bindings) || bindings.length === 0) {
      return NextResponse.json(
        { error: '文件格式错误或数据为空' },
        { status: 400 }
      );
    }

    let bound = 0;
    let skipped = 0;
    let roomsCreated = 0;
    const errors: { deviceId: string; roomName: string; error: string }[] = [];
    const roomCache = new Map<string, string>(); // roomName -> roomId cache

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
          } else {
            const newRoom = await prisma.room.create({
              data: {
                name: entry.roomName,
                type: inferRoomType(entry.roomName),
              }
            });
            roomId = newRoom.id;
            roomsCreated++;
          }

          roomCache.set(entry.roomName, roomId);
        }

        // 2. 查找并更新设备
        const device = await prisma.device.findUnique({
          where: { id: entry.deviceId }
        });

        if (!device) {
          skipped++;
          continue;
        }

        await prisma.device.update({
          where: { id: entry.deviceId },
          data: { roomId }
        });

        bound++;
      } catch (err) {
        errors.push({
          deviceId: entry.deviceId,
          roomName: entry.roomName,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '位置绑定完成',
      summary: {
        total: bindings.length,
        bound,
        skipped,
        roomsCreated,
        errors: errors.length,
      },
      details: { errors }
    });
  } catch (error) {
    console.error('导入位置绑定失败:', error);
    return NextResponse.json(
      { error: '导入失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
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
