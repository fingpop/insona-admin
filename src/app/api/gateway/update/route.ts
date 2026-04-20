import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const { gatewayId, name } = await request.json();

    if (!gatewayId) {
      return NextResponse.json({ error: "gatewayId is required" }, { status: 400 });
    }

    if (name === undefined) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const gw = await prisma.gateway.update({
      where: { id: gatewayId },
      data: { name },
    });

    return NextResponse.json({ id: gw.id, name: gw.name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update gateway";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
