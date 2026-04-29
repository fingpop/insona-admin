import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface DeviceNameEntry {
  deviceId: string;
  name: string;
}

/**
 * POST /api/import-device-names
 * 从上传的 JSON 文件批量更新设备名称
 *
 * 请求: multipart/form-data，字段 "file" 为 JSON 文件
 * JSON 格式:
 * [
 *   { "deviceId": "ECC57F10C831FF", "name": "大厅主灯" },
 *   { "deviceId": "ECC57F1095EA00", "name": "会议室射灯" }
 * ]
 *
 * 逻辑：按 deviceId 查找设备，存在则更新名称，不存在则跳过
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
    let entries: DeviceNameEntry[];
    try {
      entries = JSON.parse(rawData);
    } catch {
      return NextResponse.json(
        { error: '文件格式错误，无法解析 JSON' },
        { status: 400 }
      );
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: '文件格式错误或数据为空' },
        { status: 400 }
      );
    }

    let updated = 0;
    let skipped = 0;
    const errors: { deviceId: string; name: string; error: string }[] = [];

    for (const entry of entries) {
      try {
        const device = await prisma.device.findUnique({
          where: { id: entry.deviceId }
        });

        if (!device) {
          skipped++;
          continue;
        }

        await prisma.device.update({
          where: { id: entry.deviceId },
          data: { name: entry.name }
        });

        updated++;
      } catch (err) {
        errors.push({
          deviceId: entry.deviceId,
          name: entry.name,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: '设备名称更新完成',
      summary: {
        total: entries.length,
        updated,
        skipped,
        errors: errors.length,
      },
      details: { errors }
    });
  } catch (error) {
    console.error('导入设备名称失败:', error);
    return NextResponse.json(
      { error: '导入失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
