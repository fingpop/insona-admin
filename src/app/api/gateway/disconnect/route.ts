import { NextResponse } from "next/server";
import { gatewayService } from "@/lib/gateway/GatewayService";

export const runtime = "nodejs";

export async function POST() {
  gatewayService.disconnect();
  return NextResponse.json({ status: "disconnected" });
}
