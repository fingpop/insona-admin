import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 获取事件告警列表
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20");
    const type = searchParams.get("type"); // 可选筛选类型
    const status = searchParams.get("status"); // 可选筛选状态

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const events = await prisma.dashboardEvent.findMany({
      where,
      include: {
        device: {
          select: { name: true },
        },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    const formattedEvents = events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      type: e.type,
      deviceId: e.deviceId,
      deviceName: e.device?.name || "未知设备",
      message: e.message,
      status: e.status,
    }));

    return Response.json({
      events: formattedEvents,
      total: events.length,
    });
  } catch (error) {
    console.error("Dashboard events error:", error);
    return NextResponse.json({ error: "获取事件列表失败" }, { status: 500 });
  }
}

// 创建新事件（供其他服务调用）
export async function POST(request: Request) {
  try {
    const { type, deviceId, message, metadata } = await request.json();

    if (!type || !message) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const event = await prisma.dashboardEvent.create({
      data: {
        type,
        deviceId: deviceId || null,
        message,
        status: "unread",
        metadata: metadata ? JSON.stringify(metadata) : "{}",
      },
    });

    return Response.json({
      success: true,
      event: {
        id: event.id,
        timestamp: event.timestamp.toISOString(),
        type: event.type,
        deviceId: event.deviceId,
        message: event.message,
        status: event.status,
      },
    });
  } catch (error) {
    console.error("Create dashboard event error:", error);
    return NextResponse.json({ error: "创建事件失败" }, { status: 500 });
  }
}

// 更新事件状态（标记为已读/已处理）
export async function PUT(request: Request) {
  try {
    const { eventId, status } = await request.json();

    if (!eventId || !status) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const validStatuses = ["unread", "read", "resolved"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    const event = await prisma.dashboardEvent.update({
      where: { id: eventId },
      data: { status },
    });

    return Response.json({
      success: true,
      event: {
        id: event.id,
        status: event.status,
      },
    });
  } catch (error) {
    console.error("Update dashboard event error:", error);
    return NextResponse.json({ error: "更新事件失败" }, { status: 500 });
  }
}