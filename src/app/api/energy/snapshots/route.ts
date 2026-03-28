import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Internal endpoint for writing energy snapshots from gateway events
// Called by the SSE event handler when an energy event arrives
export async function POST(request: Request) {
  try {
    const { deviceId, kwh, rawPayload } = await request.json();

    if (!deviceId || kwh === undefined) {
      return NextResponse.json({ error: "deviceId and kwh required" }, { status: 400 });
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Write snapshot
    await prisma.energySnapshot.create({
      data: {
        deviceId,
        timestamp: now,
        kwh,
        rawPayload: JSON.stringify(rawPayload ?? {}),
      },
    });

    // Upsert daily aggregate
    await prisma.energyRecord.upsert({
      where: { deviceId_date: { deviceId, date: dateStr } },
      update: {
        kwh,
        peakWatts: Math.max(0, kwh * 1000), // rough peak estimate
      },
      create: {
        deviceId,
        date: dateStr,
        kwh,
        peakWatts: kwh * 1000,
      },
    });

    return Response.json({ result: "ok" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to record energy";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  const limit = parseInt(searchParams.get("limit") ?? "100");

  const snapshots = await prisma.energySnapshot.findMany({
    where: deviceId ? { deviceId } : undefined,
    include: { device: true },
    orderBy: { timestamp: "desc" },
    take: limit,
  });

  return Response.json({ snapshots });
}
