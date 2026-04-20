import { NextResponse } from "next/server";
import { multiGatewayService } from "@/lib/gateway/MultiGatewayService";

export const runtime = "nodejs";

export async function POST() {
  await multiGatewayService.loadAndConnectAll();
  return NextResponse.json({ status: "ok" });
}
