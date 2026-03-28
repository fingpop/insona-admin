import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = Promise<{ id: string }>;

export async function GET(_request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const device = await prisma.device.findUnique({
    where: { id },
    include: { room: true },
  });

  if (!device) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }

  // 获取今日能耗数据
  const today = new Date().toISOString().split("T")[0];
  const energyRecord = await prisma.energyRecord.findUnique({
    where: { deviceId_date: { deviceId: id, date: today } },
  });

  return Response.json({
    device: {
      ...device,
      power: energyRecord ? energyRecord.peakWatts : null,
      todayKwh: energyRecord ? energyRecord.kwh : null,
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id } = await params;
  const body = await request.json();
  const { name, roomId, ratedPower } = body;

  try {
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (roomId !== undefined) updateData.roomId = roomId || null;
    if (ratedPower !== undefined) updateData.ratedPower = ratedPower;

    const device = await prisma.device.update({
      where: { id },
      data: updateData,
      include: { room: true },
    });

    return Response.json({ device });
  } catch {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const { id } = await params;

  try {
    await prisma.device.delete({
      where: { id },
    });
    return Response.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Device not found" }, { status: 404 });
  }
}
